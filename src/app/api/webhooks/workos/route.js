import { NextResponse } from "next/server";
import { createDrizzleIdentityRepository } from "@/lib/identity-repository";
import { processWorkOSMembershipEvent } from "@/lib/identity-webhook";
import { getWorkOSIdentityProvider } from "@/lib/workos-client";
import { reportOperationFailure } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 1_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let provider;
  let event;
  try {
    provider = getWorkOSIdentityProvider();
    event = await provider.verifyWebhook({
      rawBody,
      signature: request.headers.get("workos-signature"),
    });
  } catch (error) {
    const invalidSignature = error.code === "WEBHOOK_SIGNATURE_INVALID";
    const requestId = invalidSignature ? null : reportOperationFailure("workos.webhook.verify", error);
    return NextResponse.json(
      { error: invalidSignature ? "invalid_signature" : "webhook_unavailable", ...(requestId ? { reference: requestId } : {}) },
      { status: invalidSignature ? 400 : 503 },
    );
  }

  try {
    const result = await processWorkOSMembershipEvent({
      provider,
      repository: createDrizzleIdentityRepository(),
      event,
    });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    const invalidEvent = error.code === "IDENTITY_WEBHOOK_INVALID";
    const requestId = invalidEvent ? null : reportOperationFailure("workos.webhook.process", error);
    return NextResponse.json(
      { error: invalidEvent ? "invalid_event" : "webhook_processing_unavailable", ...(requestId ? { reference: requestId } : {}) },
      { status: invalidEvent ? 400 : 503 },
    );
  }
}

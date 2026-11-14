CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"office_id" uuid,
	"operation" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"request_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_operation_not_empty" CHECK (length(btrim("audit_events"."operation")) > 0),
	CONSTRAINT "audit_events_resource_type_not_empty" CHECK (length(btrim("audit_events"."resource_type")) > 0),
	CONSTRAINT "audit_events_resource_id_not_empty" CHECK (length(btrim("audit_events"."resource_id")) > 0)
);
--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "memberships_organization_user_membership_key" UNIQUE("organization_id","user_id","id");
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_fk" FOREIGN KEY ("organization_id","actor_user_id","actor_membership_id") REFERENCES "public"."organization_memberships"("organization_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_office_fk" FOREIGN KEY ("organization_id","office_id") REFERENCES "public"."offices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_organization_created_idx" ON "audit_events" USING btree ("organization_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_prevent_mutation
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_events_prevent_truncate
BEFORE TRUNCATE ON "audit_events"
FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_event_mutation();

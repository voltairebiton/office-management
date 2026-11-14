CREATE TABLE "processed_workos_events" (
	"workos_event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"provider_created_at" timestamp with time zone,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

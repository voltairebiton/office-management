CREATE TYPE "public"."membership_status" AS ENUM('pending', 'active', 'inactive');--> statement-breakpoint
CREATE TABLE "office_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "office_assignments_office_member_key" UNIQUE("organization_id","office_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offices_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "offices_organization_code_key" UNIQUE("organization_id","code"),
	CONSTRAINT "offices_name_not_empty" CHECK (length(btrim("offices"."name")) > 0),
	CONSTRAINT "offices_code_not_empty" CHECK (length(btrim("offices"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"workos_membership_id" text NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_memberships_workos_membership_id_unique" UNIQUE("workos_membership_id"),
	CONSTRAINT "memberships_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "memberships_organization_user_key" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_organization_id" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_workos_organization_id_unique" UNIQUE("workos_organization_id"),
	CONSTRAINT "organizations_name_not_empty" CHECK (length(btrim("organizations"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "room_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_assignments_valid_dates" CHECK ("room_assignments"."ended_at" is null or "room_assignments"."ended_at" >= "room_assignments"."started_at")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_office_id_key" UNIQUE("organization_id","office_id","id"),
	CONSTRAINT "rooms_office_code_key" UNIQUE("organization_id","office_id","code"),
	CONSTRAINT "rooms_capacity_nonnegative" CHECK ("rooms"."capacity" >= 0),
	CONSTRAINT "rooms_name_not_empty" CHECK (length(btrim("rooms"."name")) > 0),
	CONSTRAINT "rooms_code_not_empty" CHECK (length(btrim("rooms"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"display_name" text,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_workos_user_id_unique" UNIQUE("workos_user_id")
);
--> statement-breakpoint
ALTER TABLE "office_assignments" ADD CONSTRAINT "office_assignments_office_fk" FOREIGN KEY ("organization_id","office_id") REFERENCES "public"."offices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "office_assignments" ADD CONSTRAINT "office_assignments_membership_fk" FOREIGN KEY ("organization_id","membership_id") REFERENCES "public"."organization_memberships"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_office_access_fk" FOREIGN KEY ("organization_id","office_id","membership_id") REFERENCES "public"."office_assignments"("organization_id","office_id","membership_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_assignments" ADD CONSTRAINT "room_assignments_room_fk" FOREIGN KEY ("organization_id","office_id","room_id") REFERENCES "public"."rooms"("organization_id","office_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_office_fk" FOREIGN KEY ("organization_id","office_id") REFERENCES "public"."offices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "office_assignments_member_idx" ON "office_assignments" USING btree ("organization_id","membership_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_assignments_one_active_per_office" ON "room_assignments" USING btree ("organization_id","office_id","membership_id") WHERE "room_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "room_assignments_active_headcount_idx" ON "room_assignments" USING btree ("organization_id","office_id","room_id") WHERE "room_assignments"."ended_at" is null;
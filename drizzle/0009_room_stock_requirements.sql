CREATE TABLE "room_stock_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"target_quantity" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_stock_requirements_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "room_stock_requirements_room_item_key" UNIQUE("organization_id","office_id","room_id","item_id"),
	CONSTRAINT "room_stock_requirements_target_nonnegative" CHECK (target_quantity >= 0),
	CONSTRAINT "room_stock_requirements_version_positive" CHECK (version >= 1)
);
--> statement-breakpoint
ALTER TABLE "room_stock_requirements" ADD CONSTRAINT "room_stock_requirements_room_fk" FOREIGN KEY ("organization_id","office_id","room_id") REFERENCES "public"."rooms"("organization_id","office_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_stock_requirements" ADD CONSTRAINT "room_stock_requirements_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."inventory_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_stock_requirements_office_active_idx" ON "room_stock_requirements" USING btree ("organization_id","office_id","is_active");
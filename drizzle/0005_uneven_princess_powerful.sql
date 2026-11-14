CREATE TYPE "public"."inventory_item_category" AS ENUM('consumable', 'reusable');--> statement-breakpoint
CREATE TYPE "public"."stock_location_kind" AS ENUM('storage', 'room');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" "inventory_item_category" NOT NULL,
	"unit" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "inventory_items_organization_sku_key" UNIQUE("organization_id","sku"),
	CONSTRAINT "inventory_items_sku_format" CHECK ("inventory_items"."sku" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
	CONSTRAINT "inventory_items_name_not_empty" CHECK (length(btrim("inventory_items"."name")) > 0),
	CONSTRAINT "inventory_items_name_max_length" CHECK (length("inventory_items"."name") <= 120),
	CONSTRAINT "inventory_items_unit_format" CHECK ("inventory_items"."unit" ~ '^[a-z][a-z0-9_-]{0,23}$')
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"room_id" uuid,
	"kind" "stock_location_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_locations_office_id_key" UNIQUE("organization_id","office_id","id"),
	CONSTRAINT "stock_locations_office_code_key" UNIQUE("organization_id","office_id","code"),
	CONSTRAINT "stock_locations_one_per_room_key" UNIQUE("organization_id","office_id","room_id"),
	CONSTRAINT "stock_locations_code_format" CHECK ("stock_locations"."code" ~ '^[A-Z0-9][A-Z0-9_-]{0,36}$'),
	CONSTRAINT "stock_locations_name_not_empty" CHECK (length(btrim("stock_locations"."name")) > 0),
	CONSTRAINT "stock_locations_name_max_length" CHECK (length("stock_locations"."name") <= 120),
	CONSTRAINT "stock_locations_kind_room_consistency" CHECK (("stock_locations"."kind" = 'room' and "stock_locations"."room_id" is not null) or ("stock_locations"."kind" = 'storage' and "stock_locations"."room_id" is null))
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_office_fk" FOREIGN KEY ("organization_id","office_id") REFERENCES "public"."offices"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_room_fk" FOREIGN KEY ("organization_id","office_id","room_id") REFERENCES "public"."rooms"("organization_id","office_id","id") ON DELETE no action ON UPDATE no action;
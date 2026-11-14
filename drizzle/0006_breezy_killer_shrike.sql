CREATE TYPE "public"."stock_movement_type" AS ENUM('receipt', 'deployment', 'return', 'transfer_out', 'transfer_in', 'consumption', 'damage', 'count_correction');--> statement-breakpoint
CREATE TYPE "public"."stock_transaction_operation" AS ENUM('receipt', 'transfer', 'consumption', 'damage', 'count_correction');--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_balances_location_item_key" UNIQUE("organization_id","office_id","location_id","item_id"),
	CONSTRAINT "stock_balances_quantity_nonnegative" CHECK ("stock_balances"."quantity" >= 0),
	CONSTRAINT "stock_balances_version_nonnegative" CHECK ("stock_balances"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"office_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"movement_type" "stock_movement_type" NOT NULL,
	"quantity_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"item_sku" text NOT NULL,
	"item_name" text NOT NULL,
	"item_category" "inventory_item_category" NOT NULL,
	"item_unit" text NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_transaction_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_movements_quantity_delta_nonzero" CHECK ("stock_movements"."quantity_delta" <> 0),
	CONSTRAINT "stock_movements_receipt_positive" CHECK ("stock_movements"."movement_type" <> 'receipt' or "stock_movements"."quantity_delta" > 0),
	CONSTRAINT "stock_movements_transfer_out_negative" CHECK ("stock_movements"."movement_type" <> 'transfer_out' or "stock_movements"."quantity_delta" < 0),
	CONSTRAINT "stock_movements_transfer_in_positive" CHECK ("stock_movements"."movement_type" <> 'transfer_in' or "stock_movements"."quantity_delta" > 0),
	CONSTRAINT "stock_movements_balance_nonnegative" CHECK ("stock_movements"."balance_after" >= 0),
	CONSTRAINT "stock_movements_item_sku_format" CHECK ("stock_movements"."item_sku" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
	CONSTRAINT "stock_movements_item_name_not_empty" CHECK (length(btrim("stock_movements"."item_name")) > 0),
	CONSTRAINT "stock_movements_item_unit_format" CHECK ("stock_movements"."item_unit" ~ '^[a-z][a-z0-9_-]{0,23}$'),
	CONSTRAINT "stock_movements_reason_not_empty" CHECK (length(btrim("stock_movements"."reason")) > 0),
	CONSTRAINT "stock_movements_reference_max_length" CHECK ("stock_movements"."reference" is null or length("stock_movements"."reference") <= 120)
);
--> statement-breakpoint
CREATE TABLE "stock_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"operation" "stock_transaction_operation" NOT NULL,
	"request_key" uuid NOT NULL,
	"payload_hash" text NOT NULL,
	"reason" text NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_transactions_organization_id_key" UNIQUE("organization_id","id"),
	CONSTRAINT "stock_transactions_request_key_key" UNIQUE("organization_id","operation","request_key"),
	CONSTRAINT "stock_transactions_payload_hash_format" CHECK ("stock_transactions"."payload_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "stock_transactions_reason_not_empty" CHECK (length(btrim("stock_transactions"."reason")) > 0),
	CONSTRAINT "stock_transactions_reference_max_length" CHECK ("stock_transactions"."reference" is null or length("stock_transactions"."reference") <= 120)
);
--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_location_fk" FOREIGN KEY ("organization_id","office_id","location_id") REFERENCES "public"."stock_locations"("organization_id","office_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."inventory_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_transaction_fk" FOREIGN KEY ("organization_id","transaction_id") REFERENCES "public"."stock_transactions"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_membership_fk" FOREIGN KEY ("organization_id","actor_user_id","actor_membership_id") REFERENCES "public"."organization_memberships"("organization_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_fk" FOREIGN KEY ("organization_id","office_id","location_id") REFERENCES "public"."stock_locations"("organization_id","office_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_fk" FOREIGN KEY ("organization_id","item_id") REFERENCES "public"."inventory_items"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_actor_membership_fk" FOREIGN KEY ("organization_id","actor_user_id","actor_membership_id") REFERENCES "public"."organization_memberships"("organization_id","user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_balances_office_location_idx" ON "stock_balances" USING btree ("organization_id","office_id","location_id");--> statement-breakpoint
CREATE INDEX "stock_movements_office_created_idx" ON "stock_movements" USING btree ("organization_id","office_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "stock_movements_item_created_idx" ON "stock_movements" USING btree ("organization_id","item_id","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION reject_stock_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'stock history is immutable' USING ERRCODE = '55000';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_prevent_mutation
BEFORE UPDATE OR DELETE ON "stock_movements"
FOR EACH ROW EXECUTE FUNCTION reject_stock_history_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_movements_prevent_truncate
BEFORE TRUNCATE ON "stock_movements"
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_history_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_transactions_prevent_mutation
BEFORE UPDATE OR DELETE ON "stock_transactions"
FOR EACH ROW EXECUTE FUNCTION reject_stock_history_mutation();
--> statement-breakpoint
CREATE TRIGGER stock_transactions_prevent_truncate
BEFORE TRUNCATE ON "stock_transactions"
FOR EACH STATEMENT EXECUTE FUNCTION reject_stock_history_mutation();

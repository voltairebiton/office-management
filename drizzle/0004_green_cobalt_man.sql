ALTER TABLE "offices" DROP CONSTRAINT "offices_code_not_empty";--> statement-breakpoint
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_code_not_empty";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "offices"
    GROUP BY "organization_id", upper(btrim("code"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve duplicate office codes before normalizing them', ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "rooms"
    GROUP BY "organization_id", "office_id", upper(btrim("code"))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve duplicate room codes within each office before normalizing them', ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM "offices" WHERE upper(btrim("code")) !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$') THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve office codes that do not match the supported format', ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "rooms" WHERE upper(btrim("code")) !~ '^[A-Z0-9][A-Z0-9_-]{0,31}$') THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve room codes that do not match the supported format', ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "offices" WHERE length(btrim("name")) > 120 OR length("address") > 240) THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve office names or addresses that exceed the supported length', ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM "rooms" WHERE length(btrim("name")) > 120) THEN
    RAISE EXCEPTION USING MESSAGE = 'Resolve room names that exceed the supported length', ERRCODE = '23514';
  END IF;
END $$;--> statement-breakpoint
UPDATE "offices" SET "name" = btrim("name"), "code" = upper(btrim("code")), "address" = nullif(btrim("address"), '');--> statement-breakpoint
UPDATE "rooms" SET "name" = btrim("name"), "code" = upper(btrim("code"));--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_name_max_length" CHECK (length("offices"."name") <= 120);--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_code_format" CHECK ("offices"."code" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$');--> statement-breakpoint
ALTER TABLE "offices" ADD CONSTRAINT "offices_address_max_length" CHECK ("offices"."address" is null or length("offices"."address") <= 240);--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_name_max_length" CHECK (length("rooms"."name") <= 120);--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_code_format" CHECK ("rooms"."code" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$');

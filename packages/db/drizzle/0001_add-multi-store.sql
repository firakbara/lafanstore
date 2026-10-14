-- Multi-store: add stores table and store_id FK to all store-scoped tables.
-- Existing data is migrated to a default store (id=1).

CREATE TYPE "public"."store_member_role" AS ENUM('owner', 'manager');

CREATE TABLE "stores" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "bot_token" text NOT NULL,
  "bot_username" text,
  "admin_ids" text DEFAULT '' NOT NULL,
  "admin_chat_id" bigint,
  "channel_url" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stores_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "store_members" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "admin_user_id" integer NOT NULL,
  "role" "store_member_role" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Seed a default store so existing rows can point to it
INSERT INTO "stores" ("slug", "name", "bot_token", "bot_username", "admin_ids")
VALUES ('default', 'Default Store', 'placeholder', null, '')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Add store_id columns with default 1 (the default store) so NOT NULL works on existing rows
ALTER TABLE "products" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "vouchers" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "orders" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "payments" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "broadcasts" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "support_sessions" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
ALTER TABLE "api_keys" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Drop the old settings PK (single key) and re-create as store-scoped
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";
ALTER TABLE "settings" ADD COLUMN "store_id" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

-- Drop the defaults now that existing rows are migrated
ALTER TABLE "products" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "vouchers" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "broadcasts" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "support_sessions" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "api_keys" ALTER COLUMN "store_id" DROP DEFAULT;
ALTER TABLE "settings" ALTER COLUMN "store_id" DROP DEFAULT;
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "settings" ADD CONSTRAINT "settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Indexes
CREATE UNIQUE INDEX "store_members_store_admin_uq" ON "store_members" USING btree ("store_id","admin_user_id");
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id");
CREATE UNIQUE INDEX "settings_store_key_uq" ON "settings" USING btree ("store_id","key");

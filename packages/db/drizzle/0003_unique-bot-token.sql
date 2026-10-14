-- Enforce bot token uniqueness at the database level (defense-in-depth).

ALTER TABLE "stores" ADD CONSTRAINT "stores_bot_token_unique" UNIQUE("bot_token");

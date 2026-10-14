-- Add missing indexes on columns used in WHERE / JOIN clauses.

CREATE INDEX "referral_payouts_user_idx" ON "referral_payouts" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");

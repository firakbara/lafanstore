DROP TABLE "store_members" CASCADE;--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "broadcasts_store_status_idx" ON "broadcasts" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "orders_store_idx" ON "orders" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_store_status_completed_idx" ON "orders" USING btree ("store_id","status","completed_at");--> statement-breakpoint
CREATE INDEX "payments_store_idx" ON "payments" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_store_topup_idx" ON "payments" USING btree ("store_id","purpose","status","paid_at");--> statement-breakpoint
CREATE INDEX "referral_payouts_user_idx" ON "referral_payouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "support_store_status_idx" ON "support_sessions" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "vouchers_store_idx" ON "vouchers" USING btree ("store_id");--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_bot_token_unique" UNIQUE("bot_token");--> statement-breakpoint
DROP TYPE "public"."store_member_role";
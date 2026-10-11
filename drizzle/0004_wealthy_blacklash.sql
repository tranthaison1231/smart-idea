CREATE TABLE "openai_oauth_accounts" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"host_id" text NOT NULL,
	"subject" text NOT NULL,
	"email" text,
	"access_token_ciphertext" text NOT NULL,
	"refresh_token_ciphertext" text NOT NULL,
	"id_token_ciphertext" text NOT NULL,
	"scopes" text[] NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "openai_oauth_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"expected_subject" text,
	"host_id" text NOT NULL,
	"code_verifier_ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"return_origin" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "openai_oauth_accounts" ADD CONSTRAINT "openai_oauth_accounts_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "openai_oauth_transactions" ADD CONSTRAINT "openai_oauth_transactions_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "openai_oauth_transactions_state_hash_unique" ON "openai_oauth_transactions" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "openai_oauth_transactions_owner_id_idx" ON "openai_oauth_transactions" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "openai_oauth_transactions_expires_at_idx" ON "openai_oauth_transactions" USING btree ("expires_at");
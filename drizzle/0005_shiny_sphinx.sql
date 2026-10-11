ALTER TABLE "openai_oauth_accounts" ALTER COLUMN "access_token_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openai_oauth_accounts" ALTER COLUMN "refresh_token_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openai_oauth_accounts" ALTER COLUMN "id_token_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "openai_oauth_accounts" ALTER COLUMN "expires_at" DROP NOT NULL;
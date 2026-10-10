DROP INDEX "auth_accounts_issuer_account_id_unique";--> statement-breakpoint
ALTER TABLE "auth_accounts" ALTER COLUMN "issuer" DROP NOT NULL;
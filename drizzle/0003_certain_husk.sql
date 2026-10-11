CREATE TABLE "ai_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider_type" text NOT NULL,
	"base_url" text NOT NULL,
	"api_key_ciphertext" text,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"model" text NOT NULL,
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_providers_owner_id_idx" ON "ai_providers" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_one_enabled_per_owner_idx" ON "ai_providers" USING btree ("owner_id") WHERE "ai_providers"."is_enabled" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_providers_one_oauth_per_owner_idx" ON "ai_providers" USING btree ("owner_id") WHERE "ai_providers"."provider_type" = 'oauth';

CREATE TABLE "market_discovery_preferences" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"markets" text[] DEFAULT ARRAY['Việt Nam']::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"revenue_models" text[] DEFAULT '{}'::text[] NOT NULL,
	"customer_segments" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_discovery_preferences" ADD CONSTRAINT "market_discovery_preferences_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "market_discovery_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"problem" text NOT NULL,
	"target_customer" text NOT NULL,
	"solution" text NOT NULL,
	"why_now" text NOT NULL,
	"revenue_models" text[] DEFAULT '{}'::text[] NOT NULL,
	"confidence" text NOT NULL,
	"confidence_rationale" text NOT NULL,
	"source_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"saved_idea_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"provider_type" text NOT NULL,
	"provider_model" text NOT NULL,
	"state" text NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"error_code" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_discovery_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_date" date NOT NULL,
	"scope" text NOT NULL,
	"owner_id" uuid,
	"query_version" text NOT NULL,
	"state" text NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"fetched_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_discovery_opportunities" ADD CONSTRAINT "market_discovery_opportunities_run_id_market_discovery_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."market_discovery_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_discovery_opportunities" ADD CONSTRAINT "market_discovery_opportunities_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_discovery_opportunities" ADD CONSTRAINT "market_discovery_opportunities_saved_idea_id_ideas_id_fk" FOREIGN KEY ("saved_idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_discovery_runs" ADD CONSTRAINT "market_discovery_runs_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_discovery_runs" ADD CONSTRAINT "market_discovery_runs_snapshot_id_market_discovery_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."market_discovery_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_discovery_snapshots" ADD CONSTRAINT "market_discovery_snapshots_owner_id_app_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_discovery_opportunities_run_idx" ON "market_discovery_opportunities" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "market_discovery_opportunities_owner_created_idx" ON "market_discovery_opportunities" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_discovery_runs_owner_snapshot_idx" ON "market_discovery_runs" USING btree ("owner_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "market_discovery_runs_owner_created_idx" ON "market_discovery_runs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_discovery_snapshots_daily_date_version_idx" ON "market_discovery_snapshots" USING btree ("market_date","query_version") WHERE "market_discovery_snapshots"."scope" = 'daily';--> statement-breakpoint
CREATE INDEX "market_discovery_snapshots_owner_created_idx" ON "market_discovery_snapshots" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "market_discovery_snapshots_date_idx" ON "market_discovery_snapshots" USING btree ("market_date");
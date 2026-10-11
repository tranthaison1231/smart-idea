CREATE TABLE "idea_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"product_name" text,
	"website" text,
	"overview" text NOT NULL,
	"target_customer" text,
	"key_features" text[] DEFAULT '{}'::text[] NOT NULL,
	"pricing" text,
	"strengths" text[] DEFAULT '{}'::text[] NOT NULL,
	"weaknesses" text[] DEFAULT '{}'::text[] NOT NULL,
	"sources" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_competitors" ADD CONSTRAINT "idea_competitors_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idea_competitors_idea_id_idx" ON "idea_competitors" USING btree ("idea_id");
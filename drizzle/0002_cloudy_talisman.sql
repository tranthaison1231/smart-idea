CREATE TABLE "idea_revenue_models" (
	"idea_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "idea_revenue_models_idea_id_name_pk" PRIMARY KEY("idea_id","name")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"industry" text,
	"problem" text,
	"target_customer" text,
	"solution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idea_revenue_models" ADD CONSTRAINT "idea_revenue_models_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ideas_user_updated_at_idx" ON "ideas" USING btree ("user_id","updated_at");
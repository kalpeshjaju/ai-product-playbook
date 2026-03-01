CREATE TABLE "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"prompt_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"task_type" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"response_hash" text NOT NULL,
	"output_tokens" integer NOT NULL,
	"model" text NOT NULL,
	"model_version" text NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"user_feedback" text,
	"feedback_at" timestamp with time zone,
	"thumbs" smallint,
	"user_edit_diff" text,
	"quality_score" numeric(3, 2),
	"hallucination" boolean DEFAULT false,
	"guardrail_triggered" text[]
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"source_url" text,
	"mime_type" text DEFAULT 'text/plain' NOT NULL,
	"content_hash" text NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"embedding_model_id" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "few_shot_bank" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_type" text NOT NULL,
	"input_text" text NOT NULL,
	"output_text" text NOT NULL,
	"quality_score" numeric(3, 2) NOT NULL,
	"source_generation_id" uuid,
	"curated_by" text DEFAULT 'auto' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"outcome_type" text NOT NULL,
	"outcome_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_name" text NOT NULL,
	"version" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"eval_score" numeric(3, 2),
	"active_pct" integer DEFAULT 0 NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_prompt_name_version" UNIQUE("prompt_name","version")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"preference_key" text NOT NULL,
	"preference_value" jsonb NOT NULL,
	"source" text DEFAULT 'default' NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_user_pref_key" UNIQUE("user_id","preference_key")
);
--> statement-breakpoint
ALTER TABLE "few_shot_bank" ADD CONSTRAINT "few_shot_bank_source_generation_id_ai_generations_id_fk" FOREIGN KEY ("source_generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_generation_id_ai_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."ai_generations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_gen_user" ON "ai_generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_gen_quality" ON "ai_generations" USING btree ("created_at","quality_score");--> statement-breakpoint
CREATE INDEX "idx_ai_gen_prompt" ON "ai_generations" USING btree ("prompt_version","quality_score");--> statement-breakpoint
CREATE INDEX "idx_ai_gen_model" ON "ai_generations" USING btree ("model","hallucination");--> statement-breakpoint
CREATE INDEX "idx_documents_hash" ON "documents" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "idx_documents_ingested" ON "documents" USING btree ("ingested_at");--> statement-breakpoint
CREATE INDEX "idx_few_shot_task" ON "few_shot_bank" USING btree ("task_type","quality_score");--> statement-breakpoint
CREATE INDEX "idx_few_shot_active" ON "few_shot_bank" USING btree ("is_active","task_type");--> statement-breakpoint
CREATE INDEX "idx_outcomes_generation" ON "outcomes" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "idx_outcomes_user" ON "outcomes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_prefs_user" ON "user_preferences" USING btree ("user_id");
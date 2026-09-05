CREATE TABLE "youtube_saved_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"keyword" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"search_volume" integer,
	"volume_confidence" text,
	"competition" integer,
	"overall_score" integer,
	"word_count" integer NOT NULL,
	"kind" text NOT NULL,
	"fetched_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_saved_keywords" ADD CONSTRAINT "youtube_saved_keywords_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "youtube_saved_keywords_unique_project_keyword_market" ON "youtube_saved_keywords" USING btree ("project_id","keyword","location_code","language_code");--> statement-breakpoint
CREATE INDEX "youtube_saved_keywords_project_created_idx" ON "youtube_saved_keywords" USING btree ("project_id","created_at");
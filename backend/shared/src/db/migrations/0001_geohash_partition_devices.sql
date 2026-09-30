CREATE TABLE "devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" varchar(255) NOT NULL,
	"fcm_token" text NOT NULL,
	"platform" varchar(20) DEFAULT 'android',
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "devices_device_id_unique" UNIQUE("device_id")
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "geohash" varchar(12);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "partition" integer;--> statement-breakpoint
CREATE INDEX "reports_geohash_idx" ON "reports" USING btree ("geohash");
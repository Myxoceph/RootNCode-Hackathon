-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "monument_type" AS ENUM ('mosque', 'madrasa', 'bath', 'fountain', 'arasta', 'caravanserai', 'bridge', 'tomb', 'other');

-- CreateEnum
CREATE TYPE "relation_type" AS ENUM ('revenue', 'water_supply', 'same_waqf', 'architect');

-- CreateEnum
CREATE TYPE "tip_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "monuments" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "monument_type" "monument_type" NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "period" TEXT NOT NULL,
    "archive_photo_url" TEXT,
    "archive_year" INTEGER,
    "marker_image_url" TEXT,
    "audio_capsule_url" TEXT,
    "accessibility_audio_desc" TEXT NOT NULL,
    "has_ramp" BOOLEAN NOT NULL DEFAULT false,
    "step_free_access" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "monuments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscriptions" (
    "id" UUID NOT NULL,
    "monument_id" UUID NOT NULL,
    "transcription" TEXT NOT NULL,
    "modern_turkish" TEXT NOT NULL,
    "waqf_condition" TEXT,

    CONSTRAINT "inscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monument_relations" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "relation_type" "relation_type" NOT NULL,
    "note" TEXT,

    CONSTRAINT "monument_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city_cuisines" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "dish_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "historical_context" TEXT NOT NULL,

    CONSTRAINT "city_cuisines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_tips" (
    "id" UUID NOT NULL,
    "monument_id" UUID NOT NULL,
    "tip_text" TEXT NOT NULL,
    "status" "tip_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitor_tips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monuments_slug_key" ON "monuments"("slug");

-- CreateIndex
CREATE INDEX "monuments_city_idx" ON "monuments"("city");

-- CreateIndex
CREATE INDEX "monuments_latitude_longitude_idx" ON "monuments"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "inscriptions_monument_id_idx" ON "inscriptions"("monument_id");

-- CreateIndex
CREATE INDEX "monument_relations_target_id_idx" ON "monument_relations"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "monument_relations_source_id_target_id_relation_type_key" ON "monument_relations"("source_id", "target_id", "relation_type");

-- CreateIndex
CREATE INDEX "city_cuisines_city_idx" ON "city_cuisines"("city");

-- CreateIndex
CREATE UNIQUE INDEX "city_cuisines_city_dish_name_key" ON "city_cuisines"("city", "dish_name");

-- CreateIndex
CREATE INDEX "visitor_tips_monument_id_created_at_idx" ON "visitor_tips"("monument_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_monument_id_fkey" FOREIGN KEY ("monument_id") REFERENCES "monuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monument_relations" ADD CONSTRAINT "monument_relations_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "monuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monument_relations" ADD CONSTRAINT "monument_relations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "monuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_tips" ADD CONSTRAINT "visitor_tips_monument_id_fkey" FOREIGN KEY ("monument_id") REFERENCES "monuments"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Manual constraints (not expressible in the Prisma schema)

-- A monument cannot be related to itself
ALTER TABLE "monument_relations" ADD CONSTRAINT "monument_relations_no_self_reference_chk" CHECK ("source_id" <> "target_id");

-- Coordinates must be valid WGS84 values
ALTER TABLE "monuments" ADD CONSTRAINT "monuments_latitude_range_chk" CHECK ("latitude" BETWEEN -90 AND 90);
ALTER TABLE "monuments" ADD CONSTRAINT "monuments_longitude_range_chk" CHECK ("longitude" BETWEEN -180 AND 180);

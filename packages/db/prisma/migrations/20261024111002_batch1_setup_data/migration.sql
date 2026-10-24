-- Batch 1 of phase 1: facility capability profile, clinician specialty, schedules,
-- red-flag list and system settings. Existing facility rows are converted, not dropped.
-- CreateEnum
CREATE TYPE "Service" AS ENUM ('EMERGENCY_CARE', 'GENERAL_MEDICINE', 'INTERNAL_MEDICINE', 'PAEDIATRICS', 'MATERNITY', 'SURGERY', 'MENTAL_HEALTH');

-- CreateEnum
CREATE TYPE "FacilityLevel" AS ENUM ('HEALTH_POST', 'HEALTH_CENTRE', 'DISTRICT_HOSPITAL', 'PROVINCIAL_HOSPITAL', 'REFERRAL_HOSPITAL');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "RedFlagGroup" AS ENUM ('A', 'C', 'N', 'P');

-- AlterTable: new profile columns. Rows that existed get Kigali's centre as a placeholder
-- location (the seed sets the real one) and their text level converted to the enum.
ALTER TABLE "Facility"
ADD COLUMN "latitude" DOUBLE PRECISION NOT NULL DEFAULT -1.9441,
ADD COLUMN "longitude" DOUBLE PRECISION NOT NULL DEFAULT 30.0619,
ADD COLUMN "phone" TEXT,
ADD COLUMN "sector" TEXT,
ADD COLUMN "services" "Service"[] NOT NULL DEFAULT ARRAY[]::"Service"[],
ADD COLUMN "totalBeds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "level_new" "FacilityLevel";

UPDATE "Facility" SET "level_new" = CASE
  WHEN "level" ILIKE '%post%' THEN 'HEALTH_POST'::"FacilityLevel"
  WHEN "level" ILIKE '%centre%' OR "level" ILIKE '%center%' THEN 'HEALTH_CENTRE'::"FacilityLevel"
  WHEN "level" ILIKE '%referral%' OR "level" ILIKE '%teaching%' THEN 'REFERRAL_HOSPITAL'::"FacilityLevel"
  WHEN "level" ILIKE '%provincial%' THEN 'PROVINCIAL_HOSPITAL'::"FacilityLevel"
  ELSE 'DISTRICT_HOSPITAL'::"FacilityLevel"
END;

ALTER TABLE "Facility" DROP COLUMN "level";
ALTER TABLE "Facility" RENAME COLUMN "level_new" TO "level";
ALTER TABLE "Facility" ALTER COLUMN "level" SET NOT NULL;
ALTER TABLE "Facility" ALTER COLUMN "latitude" DROP DEFAULT, ALTER COLUMN "longitude" DROP DEFAULT, ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "specialty" "Service";

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "shift" "ShiftType" NOT NULL,
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "unavailableReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedFlagQuestion" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "group" "RedFlagGroup" NOT NULL,
    "textEn" TEXT NOT NULL,
    "textRw" TEXT,
    "service" "Service" NOT NULL,
    "source" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedFlagQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "aiFailureCount" INTEGER NOT NULL DEFAULT 0,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShiftAssignment_date_shift_idx" ON "ShiftAssignment"("date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_staffId_date_shift_key" ON "ShiftAssignment"("staffId", "date", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "RedFlagQuestion_code_key" ON "RedFlagQuestion"("code");

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

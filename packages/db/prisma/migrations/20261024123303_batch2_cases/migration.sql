-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('URGENT', 'UNCERTAIN', 'MINOR');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('SUBMITTED', 'QUEUED', 'OFFERED', 'ASSIGNED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CaseOutcome" AS ENUM ('ADVISED_REMOTELY', 'PRESCRIPTION_ISSUED', 'ROUTED_TO_FACILITY', 'REFERRED_TO_912', 'NO_RESPONSE', 'CANCELLED_BY_PATIENT');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('RESPIRATORY', 'FEVER_OR_INFECTION', 'DIGESTIVE', 'SKIN', 'URINARY', 'INJURY', 'BURN', 'PREGNANCY', 'CHEST_PAIN_OR_HEART', 'NEUROLOGICAL', 'MENTAL_HEALTH', 'OTHER');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('URGENT', 'MINOR');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'MANUAL');

-- CreateEnum
CREATE TYPE "SymptomDuration" AS ENUM ('TODAY', 'ONE_TO_THREE_DAYS', 'FOUR_TO_SEVEN_DAYS', 'MORE_THAN_A_WEEK');

-- CreateEnum
CREATE TYPE "PhoneOwner" AS ENUM ('MINE', 'FAMILY_MEMBER', 'SOMEONE_ELSE');

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'SUBMITTED',
    "triageLevel" "TriageLevel",
    "triageReason" TEXT,
    "category" "Category",
    "neededService" "Service",
    "bedNeeded" BOOLEAN,
    "pregnant" BOOLEAN,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "locationSource" "LocationSource" NOT NULL,
    "sectorCode" TEXT,
    "description" TEXT,
    "duration" "SymptomDuration",
    "severity" INTEGER,
    "callRequested" BOOLEAN NOT NULL DEFAULT false,
    "callNumber" TEXT,
    "callNumberOwner" "PhoneOwner",
    "suggestedFacilityId" UUID,
    "outcome" "CaseOutcome",
    "closingNote" TEXT,
    "rating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queuedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedFlagAnswer" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "answer" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedFlagAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIResult" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "category" "Category",
    "urgency" "Urgency",
    "confidence" "Confidence",
    "reason" TEXT,
    "error" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Case_code_key" ON "Case"("code");

-- CreateIndex
CREATE INDEX "Case_patientId_status_idx" ON "Case"("patientId", "status");

-- CreateIndex
CREATE INDEX "Case_status_triageLevel_queuedAt_idx" ON "Case"("status", "triageLevel", "queuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RedFlagAnswer_caseId_questionId_key" ON "RedFlagAnswer"("caseId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AIResult_caseId_key" ON "AIResult"("caseId");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedFlagAnswer" ADD CONSTRAINT "RedFlagAnswer_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIResult" ADD CONSTRAINT "AIResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

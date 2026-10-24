-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('ESCALATION', 'DELAY_INCIDENT', 'NO_AGENT', 'NO_CAPACITY', 'AI_FAILURES');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "escalationLevel" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN     "noAgentAlerted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "noAgentSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL,
    "kind" "AlertKind" NOT NULL,
    "message" TEXT NOT NULL,
    "caseId" UUID,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_readAt_createdAt_idx" ON "Alert"("readAt", "createdAt");


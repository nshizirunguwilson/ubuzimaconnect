-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('AVAILABLE', 'BUSY', 'AWAY', 'OFFLINE');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('PATIENT', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RoutingStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'CHANGED', 'EXPIRED', 'CANCELLED', 'ARRIVED', 'DISCHARGED', 'COMPLETED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'USED', 'RELEASED');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "agentId" UUID,
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "frontOfQueue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "offerExpiresAt" TIMESTAMP(3),
ADD COLUMN     "offerSkipped" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "offeredToId" UUID;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "agentStatus" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
ADD COLUMN     "agentStatusSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "staffId" UUID,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallNote" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "answered" BOOLEAN NOT NULL,
    "dobConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseChange" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Routing" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "service" "Service" NOT NULL,
    "bedNeeded" BOOLEAN NOT NULL,
    "reason" TEXT,
    "clinicianId" UUID,
    "clinicianReason" TEXT,
    "status" "RoutingStatus" NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "createdById" UUID,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedReservation" (
    "id" UUID NOT NULL,
    "routingId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "releaseAfter" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BedReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_caseId_createdAt_idx" ON "ChatMessage"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "CallNote_caseId_createdAt_idx" ON "CallNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Routing_facilityId_status_idx" ON "Routing"("facilityId", "status");

-- CreateIndex
CREATE INDEX "Routing_caseId_idx" ON "Routing"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "BedReservation_routingId_key" ON "BedReservation"("routingId");

-- CreateIndex
CREATE INDEX "BedReservation_facilityId_status_idx" ON "BedReservation"("facilityId", "status");

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_offeredToId_fkey" FOREIGN KEY ("offeredToId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallNote" ADD CONSTRAINT "CallNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallNote" ADD CONSTRAINT "CallNote_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseChange" ADD CONSTRAINT "CaseChange_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routing" ADD CONSTRAINT "Routing_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BedReservation" ADD CONSTRAINT "BedReservation_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

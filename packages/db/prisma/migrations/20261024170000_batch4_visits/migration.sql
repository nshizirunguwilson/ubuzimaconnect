-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('INCOMING', 'HANDOVER');

-- AlterTable
ALTER TABLE "Routing" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "arrivedById" UUID;

-- CreateTable
CREATE TABLE "ClinicalEntry" (
    "id" UUID NOT NULL,
    "rootId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" UUID,
    "routingId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrivalIssue" (
    "id" UUID NOT NULL,
    "routingId" UUID NOT NULL,
    "clinicianId" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArrivalIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "routingId" UUID NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalEntry_previousVersionId_key" ON "ClinicalEntry"("previousVersionId");

-- CreateIndex
CREATE INDEX "ClinicalEntry_routingId_rootId_idx" ON "ClinicalEntry"("routingId", "rootId");

-- CreateIndex
CREATE INDEX "ClinicalEntry_patientId_createdAt_idx" ON "ClinicalEntry"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_staffId_readAt_idx" ON "Notification"("staffId", "readAt");

-- AddForeignKey
ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalEntry" ADD CONSTRAINT "ClinicalEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrivalIssue" ADD CONSTRAINT "ArrivalIssue_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrivalIssue" ADD CONSTRAINT "ArrivalIssue_clinicianId_fkey" FOREIGN KEY ("clinicianId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE CASCADE ON UPDATE CASCADE;


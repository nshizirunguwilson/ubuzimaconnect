-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "patientId" UUID;

-- CreateTable
CREATE TABLE "Prescription" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "caseId" UUID,
    "routingId" UUID,
    "prescriberId" UUID NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrescriptionItem" (
    "id" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "medicine" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_code_key" ON "Prescription"("code");

-- CreateIndex
CREATE INDEX "Prescription_patientId_createdAt_idx" ON "Prescription"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_prescriberId_createdAt_idx" ON "Prescription"("prescriberId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_patientId_createdAt_idx" ON "AuditEvent"("patientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "Routing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_prescriberId_fkey" FOREIGN KEY ("prescriberId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- FR 10.2: link the events recorded before this column existed to their patient.
UPDATE "AuditEvent" SET "patientId" = "actorId"::uuid WHERE "actorType" = 'patient' AND "actorId" IS NOT NULL;
UPDATE "AuditEvent" SET "patientId" = (detail->>'patientId')::uuid WHERE "patientId" IS NULL AND detail ? 'patientId';
UPDATE "AuditEvent" a SET "patientId" = c."patientId" FROM "Case" c WHERE a."patientId" IS NULL AND a.detail ? 'caseId' AND c.id = (a.detail->>'caseId')::uuid;
UPDATE "AuditEvent" a SET "patientId" = c."patientId" FROM "Routing" r JOIN "Case" c ON c.id = r."caseId" WHERE a."patientId" IS NULL AND a.detail ? 'routingId' AND r.id = (a.detail->>'routingId')::uuid;

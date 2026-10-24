-- FR 2.1 lists four staff roles. Pharmacists have no account (they use the public
-- prescription check page, FR 11.7), so the PHARMACIST role is removed.
-- Only seeded test accounts ever had this role.
DELETE FROM "Staff" WHERE "role" = 'PHARMACIST';

ALTER TYPE "StaffRole" RENAME TO "StaffRole_old";
CREATE TYPE "StaffRole" AS ENUM ('AGENT', 'CLINICIAN', 'FACILITY_MANAGER', 'ADMIN');
ALTER TABLE "Staff" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::text::"StaffRole");
DROP TYPE "StaffRole_old";

-- Urgent suggestions are now Routing rows in the Suggested state (FR 5.5, 5.12), so this column is no longer used.
ALTER TABLE "Case" DROP COLUMN "suggestedFacilityId";

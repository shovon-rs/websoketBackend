-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "status" SET DEFAULT 'new';

-- DataFix: the old 3-stage pipeline's starting status ('todo') is renamed to the new 5-stage
-- pipeline's starting status ('new'); 'in_progress' and 'done' are unchanged and need no fix.
UPDATE "tasks" SET "status" = 'new' WHERE "status" = 'todo';

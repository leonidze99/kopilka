-- CreateEnum
CREATE TYPE "recurring_unit" AS ENUM ('day', 'week', 'month');

-- AlterTable
ALTER TABLE "recurring_rules" ADD COLUMN     "every" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unit" "recurring_unit" NOT NULL DEFAULT 'month';

-- Existing rules are monthly, which the defaults already say. The bound is
-- what the API validates too; here it holds whatever writes the row.
ALTER TABLE "recurring_rules"
  ADD CONSTRAINT "recurring_rules_every_check" CHECK ("every" BETWEEN 1 AND 365);

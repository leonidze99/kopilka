-- Undoing an import (status undone) and possible duplicates: statement rows
-- that look like a transaction entered by hand.
--
-- ADD VALUE to an enum may run in a transaction (PostgreSQL 12+); the new
-- value only cannot be used before that transaction commits.

-- AlterEnum
ALTER TYPE "import_status" ADD VALUE 'undone';

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN     "similar_transaction_id" UUID;

-- AlterTable
ALTER TABLE "imports" ADD COLUMN     "undone_rows" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "import_rows_similar_transaction_id_idx" ON "import_rows"("similar_transaction_id");

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_similar_transaction_id_fkey" FOREIGN KEY ("similar_transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


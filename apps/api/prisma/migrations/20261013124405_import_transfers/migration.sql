-- AlterTable
ALTER TABLE "import_category_rules" ADD COLUMN     "to_account_id" UUID,
ALTER COLUMN "category_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "import_rows" ADD COLUMN     "to_account_id" UUID;

-- CreateIndex
CREATE INDEX "import_category_rules_to_account_id_idx" ON "import_category_rules"("to_account_id");

-- CreateIndex
CREATE INDEX "import_rows_to_account_id_idx" ON "import_rows"("to_account_id");

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_category_rules" ADD CONSTRAINT "import_category_rules_to_account_id_user_id_fkey" FOREIGN KEY ("to_account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A rule says one of two things: put these rows in this category, or make
-- them transfers to this account. Prisma cannot express it; the database can.
ALTER TABLE "import_category_rules"
  ADD CONSTRAINT "import_category_rules_target_check"
  CHECK (num_nonnulls(category_id, to_account_id) = 1);

-- The same for a parsed row, once the user has chosen (both NULL until then).
ALTER TABLE "import_rows"
  ADD CONSTRAINT "import_rows_target_check"
  CHECK (num_nonnulls(category_id, to_account_id) <= 1);

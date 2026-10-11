-- categories.kind is NOT NULL without a default: fine while the table is empty
-- (nothing is deployed yet). With data it would need a backfill first.

-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_id_fkey";

-- DropIndex
DROP INDEX "categories_user_id_name_key";

-- DropIndex
DROP INDEX "transactions_user_id_occurred_at_idx";

-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "kind" "transaction_kind" NOT NULL;

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "kind";

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_kind_name_key" ON "categories"("user_id", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_at_id_idx" ON "transactions"("user_id", "occurred_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


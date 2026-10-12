-- Bank statement import: the import, its staged rows, remembered category
-- mappings, and the link from a transaction to its statement row.
-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('uploading', 'uploaded', 'parsing', 'ready', 'importing', 'done', 'failed');

-- CreateEnum
CREATE TYPE "import_row_status" AS ENUM ('new', 'duplicate', 'invalid', 'skipped', 'imported');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "import_fingerprint" CHAR(64),
ADD COLUMN     "import_id" UUID;

-- CreateTable
CREATE TABLE "imports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "status" "import_status" NOT NULL,
    "headers" TEXT[],
    "preset" VARCHAR(32),
    "columns" JSONB,
    "time_zone" VARCHAR(64),
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "new_rows" INTEGER NOT NULL DEFAULT 0,
    "duplicate_rows" INTEGER NOT NULL DEFAULT 0,
    "invalid_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(280),
    "locked_until" TIMESTAMPTZ(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "import_id" UUID NOT NULL,
    "line" INTEGER NOT NULL,
    "cells" TEXT[],
    "status" "import_row_status",
    "local_at" TIMESTAMP(0),
    "occurred_at" TIMESTAMPTZ(3),
    "amount" DECIMAL(14,2),
    "kind" "transaction_kind",
    "description" VARCHAR(280),
    "source_category" VARCHAR(64),
    "category_id" UUID,
    "fingerprint" CHAR(64),
    "error" VARCHAR(280),

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("import_id","line")
);

-- CreateTable
CREATE TABLE "import_category_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "transaction_kind" NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "import_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "imports_user_id_created_at_idx" ON "imports"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "imports_status_idx" ON "imports"("status");

-- CreateIndex
CREATE INDEX "import_category_rules_category_id_idx" ON "import_category_rules"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_category_rules_user_id_kind_source_key" ON "import_category_rules"("user_id", "kind", "source");

-- CreateIndex
CREATE INDEX "transactions_import_id_idx" ON "transactions"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_import_fingerprint_key" ON "transactions"("account_id", "import_fingerprint");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_category_rules" ADD CONSTRAINT "import_category_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_category_rules" ADD CONSTRAINT "import_category_rules_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;



-- From parsing on, the import knows which account it goes to.
ALTER TABLE "imports" ADD CONSTRAINT "imports_account_check" CHECK ("status" IN ('uploading', 'uploaded') OR "account_id" IS NOT NULL);
ALTER TABLE "imports" ADD CONSTRAINT "imports_counts_check" CHECK ("total_rows" >= 0 AND "processed" >= 0 AND "attempts" >= 0);

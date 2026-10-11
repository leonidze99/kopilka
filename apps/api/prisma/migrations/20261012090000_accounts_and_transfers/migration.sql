-- Accounts and transfers. The transactions table already has data, so a
-- new NOT NULL column cannot be added in one step: expand -> backfill ->
-- contract. Here all three run in one migration (one transaction: Postgres
-- DDL is transactional). With zero downtime they would be three releases:
-- 1) add the nullable column and the code that writes it, 2) backfill in
-- batches, 3) SET NOT NULL once no old code can insert without it.

-- CreateEnum
CREATE TYPE "account_type" AS ENUM ('card', 'cash', 'savings');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "type" "account_type" NOT NULL,
    "opening_balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "allow_negative" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id"),
    -- A balance below zero only where it is allowed (Prisma cannot express CHECK).
    CONSTRAINT "accounts_negative_allowed_check" CHECK ("allow_negative" OR "opening_balance" >= 0)
);

CREATE UNIQUE INDEX "accounts_user_id_name_key" ON "accounts"("user_id", "name");
CREATE UNIQUE INDEX "accounts_id_user_id_key" ON "accounts"("id", "user_id");

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 1. Expand: the new columns, nullable for now.
ALTER TABLE "transactions" ADD COLUMN "account_id" UUID,
ADD COLUMN "to_account_id" UUID,
ALTER COLUMN "category_id" DROP NOT NULL;

-- 2. Backfill: every existing user gets a main account holding all their
-- transactions. The app generates UUIDv7 ids; Postgres 16 has no uuidv7(),
-- and a random v4 id is just as unique.
INSERT INTO "accounts" ("id", "user_id", "name", "type", "updated_at")
SELECT gen_random_uuid(), "id", 'Основной счёт', 'card', CURRENT_TIMESTAMP
FROM "users";

UPDATE "transactions" t
SET "account_id" = a."id"
FROM "accounts" a
WHERE a."user_id" = t."user_id";

-- 3. Contract: every row has an account now.
ALTER TABLE "transactions" ALTER COLUMN "account_id" SET NOT NULL;

CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");
CREATE INDEX "transactions_to_account_id_idx" ON "transactions"("to_account_id");

-- Composite keys: an account of the same user only, checked by the database.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_to_account_id_user_id_fkey" FOREIGN KEY ("to_account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Either a category (income/expense) or a target account (transfer), never
-- both or neither; and a transfer goes to another account.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_or_transfer_check" CHECK (num_nonnulls("category_id", "to_account_id") = 1);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_accounts_check" CHECK ("to_account_id" <> "account_id");

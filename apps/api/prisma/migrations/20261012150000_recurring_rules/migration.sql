-- Monthly recurring transactions, created by the server on their day.
ALTER TABLE "transactions" ADD COLUMN     "recurring_on" DATE,
ADD COLUMN     "recurring_rule_id" UUID;

-- CreateTable
CREATE TABLE "recurring_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "category_id" UUID,
    "to_account_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "comment" VARCHAR(280),
    "start_on" DATE NOT NULL,
    "time_zone" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "next_on" DATE NOT NULL,
    "next_index" INTEGER NOT NULL,
    "last_error" VARCHAR(280),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_rules_user_id_idx" ON "recurring_rules"("user_id");

-- CreateIndex
CREATE INDEX "recurring_rules_due_idx" ON "recurring_rules"("next_on");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_recurring_rule_id_recurring_on_key" ON "transactions"("recurring_rule_id", "recurring_on");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_rule_id_fkey" FOREIGN KEY ("recurring_rule_id") REFERENCES "recurring_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_account_id_user_id_fkey" FOREIGN KEY ("account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_to_account_id_user_id_fkey" FOREIGN KEY ("to_account_id", "user_id") REFERENCES "accounts"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- As on transactions: a category (income/expense) or a target account
-- (transfer), and a transfer goes to another account. Prisma cannot express CHECK.
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_category_or_transfer_check" CHECK (num_nonnulls("category_id", "to_account_id") = 1);
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_transfer_accounts_check" CHECK ("to_account_id" <> "account_id");
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_next_index_check" CHECK ("next_index" >= 0);

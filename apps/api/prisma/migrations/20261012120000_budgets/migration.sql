-- Spending limits of expense categories, as versions by month.

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(14,2),
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_user_id_idx" ON "budgets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_category_id_effective_from_key" ON "budgets"("category_id", "effective_from");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A version starts on the 1st: it is a month, stored as a date (Prisma cannot express CHECK).
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_effective_from_month_check" CHECK (extract(day FROM "effective_from") = 1);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "budget_alerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "time_zone" VARCHAR(64) NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "budget_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "spent" DECIMAL(14,2) NOT NULL,
    "limit" DECIMAL(14,2) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budget_alerts_user_id_idx" ON "budget_alerts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "budget_alerts_category_id_month_key" ON "budget_alerts"("category_id", "month");

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_alerts" ADD CONSTRAINT "budget_alerts_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

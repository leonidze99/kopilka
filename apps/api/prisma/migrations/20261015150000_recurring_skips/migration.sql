-- A skipped recurring payment is remembered until the user is told about it.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "recurring_alerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "recurring_skips" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "on_date" DATE NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "recurring_skips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_skips_user_id_idx" ON "recurring_skips"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_skips_rule_id_on_date_key" ON "recurring_skips"("rule_id", "on_date");

-- AddForeignKey
ALTER TABLE "recurring_skips" ADD CONSTRAINT "recurring_skips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_skips" ADD CONSTRAINT "recurring_skips_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurring_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;


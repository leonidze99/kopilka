-- CreateTable
CREATE TABLE "tag_budget_alerts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "limit" DECIMAL(14,2) NOT NULL,
    "spent" DECIMAL(14,2) NOT NULL,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_budget_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tag_budget_alerts_user_id_idx" ON "tag_budget_alerts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tag_budget_alerts_tag_id_limit_key" ON "tag_budget_alerts"("tag_id", "limit");

-- AddForeignKey
ALTER TABLE "tag_budget_alerts" ADD CONSTRAINT "tag_budget_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_budget_alerts" ADD CONSTRAINT "tag_budget_alerts_tag_id_user_id_fkey" FOREIGN KEY ("tag_id", "user_id") REFERENCES "tags"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


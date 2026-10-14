-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "image" BYTEA NOT NULL,
    "thumbnail" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receipts_transaction_id_created_at_idx" ON "receipts"("transaction_id", "created_at");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prisma cannot say it.
ALTER TABLE "receipts"
  ADD CONSTRAINT "receipts_dimensions_check" CHECK ("width" > 0 AND "height" > 0);

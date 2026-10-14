-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    -- What two names must differ in: "Отпуск", "отпуск" and "ОТПУСК" are one
    -- tag, "Ёлка" and "елка" too. Generated, as transactions.comment_search:
    -- every write path gets it, and the unique index below compares it.
    -- Prisma reads it as a default (dbgenerated in the schema).
    "name_key" TEXT NOT NULL GENERATED ALWAYS AS (lower(translate("name", 'ёЁ', 'еЕ'))) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tags" (
    "transaction_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transaction_id","tag_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key_key" ON "tags"("user_id", "name_key");

-- CreateIndex
CREATE UNIQUE INDEX "tags_id_user_id_key" ON "tags"("id", "user_id");

-- CreateIndex
CREATE INDEX "transaction_tags_tag_id_idx" ON "transaction_tags"("tag_id");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_user_id_fkey" FOREIGN KEY ("tag_id", "user_id") REFERENCES "tags"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


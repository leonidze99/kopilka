-- Browsers a user has signed in from, for the letter about a new one.
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "login_alerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "known_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "device" VARCHAR(100) NOT NULL,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified_at" TIMESTAMPTZ(3),

    CONSTRAINT "known_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "known_devices_user_id_token_hash_key" ON "known_devices"("user_id", "token_hash");

-- AddForeignKey
ALTER TABLE "known_devices" ADD CONSTRAINT "known_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


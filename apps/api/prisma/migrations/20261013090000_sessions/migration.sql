-- Sessions: a row per signed-in device. Until now a session was only a
-- family_id shared by refresh tokens, with nowhere to keep the device, the
-- last activity or "ended". refresh_tokens.revoked_at keeps one meaning,
-- "used by a rotation"; sessions.revoked_at becomes "ended".

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- Backfill, before the foreign key: a session per existing family. A live
-- family has exactly one unused token; a family whose every token is used
-- was signed out or caught reusing a token, i.e. ended. Device and IP are
-- unknown for these; they show up at the next refresh.
INSERT INTO "sessions" ("id", "user_id", "created_at", "last_used_at", "expires_at", "revoked_at")
SELECT "family_id",
       min("user_id"::text)::uuid,
       min("created_at"),
       max("created_at"),
       max("expires_at"),
       CASE WHEN bool_and("revoked_at" IS NOT NULL) THEN max("revoked_at") END
FROM "refresh_tokens"
GROUP BY "family_id";

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

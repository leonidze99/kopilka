-- An account can be archived: closed with nothing left on it, its history
-- kept. A nullable column without a default: a catalog change only.
ALTER TABLE "accounts" ADD COLUMN "archived_at" TIMESTAMPTZ(3);

-- A limit on what a tag may cost over all time ("Отпуск" — 150 000 ₽).
-- NULL: no limit. Adding a nullable column without a default rewrites
-- nothing: a quick catalog change even on a big table.
ALTER TABLE "tags" ADD COLUMN "budget" DECIMAL(14,2);

-- Prisma does not express CHECK constraints.
ALTER TABLE "tags"
  ADD CONSTRAINT "tags_budget_check" CHECK ("budget" > 0);

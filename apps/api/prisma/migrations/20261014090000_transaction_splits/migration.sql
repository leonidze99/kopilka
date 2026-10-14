-- CreateTable
CREATE TABLE "transaction_splits" (
    "transaction_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("transaction_id","category_id")
);

-- CreateIndex
CREATE INDEX "transaction_splits_category_id_idx" ON "transaction_splits"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_id_user_id_key" ON "transactions"("id", "user_id");

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Checked at COMMIT (Prisma cannot say DEFERRABLE). Deleting a user
-- cascades to its categories and, separately, through its transactions to
-- their parts; checked any earlier, a category would be refused while its
-- parts were still on their way out. Deleting a category with parts in it
-- is still refused, at commit.
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- Prisma cannot say these.
ALTER TABLE "transaction_splits"
  ADD CONSTRAINT "transaction_splits_amount_check" CHECK ("amount" > 0);

-- A split income or expense has neither a category nor a target account:
-- its categories are in its parts.
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_category_or_transfer_check";
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_category_or_transfer_check"
  CHECK (num_nonnulls("category_id", "to_account_id") <= 1);

-- The parts of a transaction, checked as a whole: a transaction with
-- neither a category nor a target account has at least two parts that add
-- up to its amount; any other transaction has none.
--
-- A CHECK sees one row and cannot say this. A trigger can, but not row by
-- row as the rows come: a split is written as a transaction and then its
-- parts, and in between it is a transaction without any. So the triggers
-- are constraint triggers, DEFERRABLE INITIALLY DEFERRED: they run at
-- COMMIT and see the transaction and its parts as written.
CREATE FUNCTION "transaction_splits_check"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  owner record;
  parts integer;
  total numeric;
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    target := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target := OLD.transaction_id;
  ELSE
    target := NEW.transaction_id;
  END IF;

  SELECT category_id, to_account_id, amount INTO owner
  FROM transactions WHERE id = target;
  -- Deleted, and its parts with it.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT count(*), COALESCE(sum(amount), 0) INTO parts, total
  FROM transaction_splits WHERE transaction_id = target;

  IF owner.category_id IS NULL AND owner.to_account_id IS NULL THEN
    IF parts < 2 OR total <> owner.amount THEN
      RAISE EXCEPTION 'Split transaction % has % parts adding up to %, not %',
        target, parts, total, owner.amount
        USING ERRCODE = 'check_violation',
              CONSTRAINT = 'transaction_splits_total_check';
    END IF;
  ELSIF parts > 0 THEN
    RAISE EXCEPTION 'Transaction % has a category or is a transfer, and parts too',
      target
      USING ERRCODE = 'check_violation',
            CONSTRAINT = 'transaction_splits_total_check';
  END IF;
  RETURN NULL;
END
$$;

-- Any change of the parts (a part never moves to another transaction:
-- they are replaced, not updated).
CREATE CONSTRAINT TRIGGER "transaction_splits_check"
  AFTER INSERT OR UPDATE OR DELETE ON "transaction_splits"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "transaction_splits_check"();

-- On transactions only the rows that are, or were, split: an import inserts
-- thousands of plain ones, and they have no parts to check.
CREATE CONSTRAINT TRIGGER "transactions_split_insert_check"
  AFTER INSERT ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.category_id IS NULL AND NEW.to_account_id IS NULL)
  EXECUTE FUNCTION "transaction_splits_check"();

CREATE CONSTRAINT TRIGGER "transactions_split_update_check"
  AFTER UPDATE OF "amount", "category_id", "to_account_id" ON "transactions"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN ((OLD.category_id IS NULL AND OLD.to_account_id IS NULL)
     OR (NEW.category_id IS NULL AND NEW.to_account_id IS NULL))
  EXECUTE FUNCTION "transaction_splits_check"();

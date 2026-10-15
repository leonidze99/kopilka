-- A recurring rule may split each payment between categories, as a
-- transaction can (transaction_splits).

-- CreateTable
CREATE TABLE "recurring_rule_splits" (
    "rule_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "recurring_rule_splits_pkey" PRIMARY KEY ("rule_id","category_id")
);

-- CreateIndex
CREATE INDEX "recurring_rule_splits_category_id_idx" ON "recurring_rule_splits"("category_id");

-- AddForeignKey
ALTER TABLE "recurring_rule_splits" ADD CONSTRAINT "recurring_rule_splits_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurring_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_rule_splits" ADD CONSTRAINT "recurring_rule_splits_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A split rule has neither a category nor a target account: one of the two
-- at most, as on transactions. That it then has parts adding up to its
-- amount is the service's check (the only writer of rules).
ALTER TABLE "recurring_rules" DROP CONSTRAINT "recurring_rules_category_or_transfer_check";
ALTER TABLE "recurring_rules"
  ADD CONSTRAINT "recurring_rules_category_or_transfer_check"
    CHECK (num_nonnulls("category_id", "to_account_id") <= 1);

ALTER TABLE "recurring_rule_splits"
  ADD CONSTRAINT "recurring_rule_splits_amount_check" CHECK ("amount" > 0);

-- A rule is a setting that goes with its category (ON DELETE CASCADE).
-- For a split rule the cascade reaches a part only, which would leave the
-- rest not adding up: the whole rule goes instead. Only when the category
-- itself is gone — the service replacing parts keeps the rule.
CREATE FUNCTION recurring_split_category_gone() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM categories WHERE id = OLD.category_id) THEN
    DELETE FROM recurring_rules WHERE id = OLD.rule_id;
  END IF;
  RETURN NULL;
END
$$;

CREATE TRIGGER "recurring_rule_splits_category_gone"
  AFTER DELETE ON "recurring_rule_splits"
  FOR EACH ROW EXECUTE FUNCTION recurring_split_category_gone();

-- Currencies: an account is kept in one, the user counts in another (the
-- base currency), and every transaction carries its amount in both.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "base_currency" CHAR(3) NOT NULL DEFAULT 'RUB';

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "currency" CHAR(3) NOT NULL DEFAULT 'RUB';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "base_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "base_manual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "to_amount" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "currency" CHAR(3) NOT NULL,
    "on_date" DATE NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("currency","on_date")
);

-- Backfill: everything so far was in roubles, the base currency of all.
-- Rewrites every row of transactions; before the trigger below exists, so
-- it does not run for each. (On a large live table: in batches, by id.)
UPDATE "transactions"
SET "base_amount" = "amount",
    "to_amount" = CASE WHEN "to_account_id" IS NOT NULL THEN "amount" END;

-- Not expressible in Prisma: ISO-shaped codes (the API checks the list),
-- a received amount on transfers and only there, positive rates.
ALTER TABLE "users"
  ADD CONSTRAINT "users_base_currency_check" CHECK ("base_currency" ~ '^[A-Z]{3}$');
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_to_amount_check"
    CHECK (("to_account_id" IS NULL) = ("to_amount" IS NULL) AND "to_amount" > 0);
ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "exchange_rates_rate_check" CHECK ("rate" > 0);

-- Roubles for one unit of a currency on a day: the latest Bank of Russia
-- rate on or before it (rates are set for working days only). A rate more
-- than two weeks older than the day (or than today, for a future day) is
-- not a rate for it: NULL, and the caller decides. The rouble is 1.
CREATE FUNCTION exchange_rate(code CHAR(3), day DATE) RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN code = 'RUB' THEN 1::numeric ELSE (
    SELECT r.rate FROM exchange_rates r
    WHERE r.currency = code
      AND r.on_date <= day
      AND r.on_date >= LEAST(day, current_date) - 14
    ORDER BY r.on_date DESC
    LIMIT 1
  ) END
$$;

-- The money columns of a transaction that follow from the others, on every
-- write path alike (the API, the recurring runner, imports, the seed), as
-- a generated column would — but they read other tables:
--   to_amount   = amount on a transfer between accounts of one currency;
--                 between two currencies it must be given (the bank's rate
--                 is not the Bank of Russia's); NULL if not a transfer.
--   base_amount = amount in the user's base currency: amount itself in the
--                 base currency, else converted at the rates of the local
--                 day of the transaction (the user's time zone) — unless
--                 base_manual, given by hand.
-- A missing rate refuses the write (EXCHANGE_RATE_MISSING): a total that
-- silently left a transaction out would be worse. The API loads the rates
-- it needs before writing (RatesService.ensure).
CREATE FUNCTION transactions_money() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  account_currency CHAR(3);
  target_currency CHAR(3);
  base CHAR(3);
  day DATE;
  rate NUMERIC;
BEGIN
  SELECT a.currency, u.base_currency, (NEW.occurred_at AT TIME ZONE u.time_zone)::date
    INTO account_currency, base, day
  FROM accounts a
  JOIN users u ON u.id = a.user_id
  WHERE a.id = NEW.account_id;
  -- Not an account (of this user): the foreign key refuses the row.
  IF account_currency IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.to_account_id IS NULL THEN
    NEW.to_amount := NULL;
  ELSE
    SELECT currency INTO target_currency FROM accounts WHERE id = NEW.to_account_id;
    IF target_currency IS NULL OR target_currency = account_currency THEN
      NEW.to_amount := NEW.amount;
    ELSIF NEW.to_amount IS NULL THEN
      RAISE EXCEPTION 'TRANSFER_AMOUNT_MISSING: % to %', account_currency, target_currency;
    END IF;
  END IF;

  IF account_currency = base THEN
    NEW.base_amount := NEW.amount;
    NEW.base_manual := false;
  ELSIF NOT NEW.base_manual THEN
    rate := exchange_rate(account_currency, day) / exchange_rate(base, day);
    IF rate IS NULL THEN
      RAISE EXCEPTION 'EXCHANGE_RATE_MISSING: % to % on %', account_currency, base, day;
    END IF;
    NEW.base_amount := round(NEW.amount * rate, 2);
  END IF;
  RETURN NEW;
END
$$;

-- Only when a column it depends on is written: not for a comment, a
-- recurring_rule_id set to NULL by a deleted rule, an import's
-- bookkeeping. Changing the base currency writes base_manual = false to
-- every transaction of the user, which recomputes them all.
CREATE TRIGGER "transactions_money"
  BEFORE INSERT OR UPDATE OF "account_id", "to_account_id", "amount", "to_amount",
    "occurred_at", "base_amount", "base_manual"
  ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION transactions_money();

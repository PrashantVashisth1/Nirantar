-- Days the last fill was meant to last, so the app can show "5 of 30 days left".
-- Existing rows get 30 (a monthly supply) once; new rows must always set it.
ALTER TABLE "refill_subscriptions" ADD COLUMN "days_supply" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "refill_subscriptions" ALTER COLUMN "days_supply" DROP DEFAULT;
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT refill_subscriptions_supply_positive
  CHECK (days_supply > 0 AND daily_units > 0);

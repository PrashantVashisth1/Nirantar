-- Safety rules enforced by the database itself (plan §6.2).
--
-- The API checks these rules first and gives friendly messages. The database
-- repeats the most important ones so that a bug, a new endpoint or a raw SQL
-- statement still can't break them.
--
-- Errors raised here start with "NIRANTAR:<CODE>:" so the API can recognise
-- them and turn them into clear 422 responses.

-- ─────────────────────────────────────────────────────────────────────────────
-- Rule B1: Schedule X and narcotic (NDPS) products are never sold online.
-- Fixed rule: it does not read schedule_rules, so no configuration can lift it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nirantar_block_banned_items() RETURNS trigger AS $$
DECLARE
  item_schedule "Schedule";
BEGIN
  SELECT schedule INTO item_schedule FROM products WHERE id = NEW.product_id;
  IF item_schedule IN ('X', 'NDPS') THEN
    RAISE EXCEPTION 'NIRANTAR:SCHEDULE_NOT_SOLD_ONLINE: product % is Schedule % and cannot be sold online',
      NEW.product_id, item_schedule
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER order_items_block_banned
  BEFORE INSERT OR UPDATE OF product_id ON order_items
  FOR EACH ROW EXECUTE FUNCTION nirantar_block_banned_items();

-- The configurable rules table may only hold OTC, H and H1 (B2). X and NDPS
-- can't be given a row, so they can't be "configured" as sellable.
ALTER TABLE schedule_rules
  ADD CONSTRAINT schedule_rules_only_configurable
  CHECK (schedule IN ('OTC', 'H', 'H1'));

-- ─────────────────────────────────────────────────────────────────────────────
-- Rule B7: the dispatch gate.
-- An order can only be in PICKING, PACKED, OUT_FOR_DELIVERY or DELIVERED if:
--   * it has a store and at least one active item;
--   * EVERY active item (OTC included) is approved by an active, registered
--     pharmacist, and the item still matches what was approved: same quantity,
--     same prescription, and either the approved product or the approved
--     generic that the customer consented to (B4-B6);
--   * no item is Schedule X / NDPS;
--   * if any item needs a prescription, the prescription is VERIFIED;
--   * on handover/delivery, every H1 item has an H1 register entry (B8).
-- Runs on INSERT too, so an order can't be created directly in a fulfilment state.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION nirantar_dispatch_gate() RETURNS trigger AS $$
DECLARE
  item record;
  active_items integer;
  needs_prescription boolean := false;
  prescription_status "ReviewStatus";
BEGIN
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: order % has no assigned store', NEW.number
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO active_items
    FROM order_items WHERE order_id = NEW.id AND status = 'ACTIVE';
  IF active_items = 0 THEN
    RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: order % has no approved items', NEW.number
      USING ERRCODE = 'check_violation';
  END IF;

  FOR item IN
    SELECT oi.id,
           oi.product_id,
           oi.quantity,
           oi.approved_by_id,
           oi.approved_product_id,
           oi.approved_quantity,
           oi.approved_prescription_id,
           oi.approved_generic_product_id,
           oi.customer_choice,
           oi.consent_at,
           p.name                               AS product_name,
           p.schedule                           AS schedule,
           -- A schedule without a rule is treated as needing a prescription (safe default).
           coalesce(r.rx_required, true)        AS rx_required,
           coalesce(r.register_required, false) AS register_required,
           u.role                               AS approver_role,
           coalesce(u.is_active, false)         AS approver_active,
           u.pharmacist_reg_no                  AS approver_reg_no
      FROM order_items oi
      JOIN products p ON p.id = oi.product_id
      LEFT JOIN schedule_rules r ON r.schedule = p.schedule
      LEFT JOIN users u ON u.id = oi.approved_by_id
     WHERE oi.order_id = NEW.id AND oi.status = 'ACTIVE'
  LOOP
    IF item.schedule IN ('X', 'NDPS') THEN
      RAISE EXCEPTION 'NIRANTAR:SCHEDULE_NOT_SOLD_ONLINE: % is Schedule % and cannot be sold online',
        item.product_name, item.schedule
        USING ERRCODE = 'check_violation';
    END IF;

    IF item.approved_by_id IS NULL
       OR item.approver_role IS DISTINCT FROM 'PHARMACIST'
       OR NOT item.approver_active
       OR item.approver_reg_no IS NULL THEN
      RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: % is not approved by an active registered pharmacist',
        item.product_name
        USING ERRCODE = 'check_violation';
    END IF;

    IF item.approved_quantity IS DISTINCT FROM item.quantity THEN
      RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: % quantity changed after approval', item.product_name
        USING ERRCODE = 'check_violation';
    END IF;

    IF item.approved_prescription_id IS DISTINCT FROM NEW.prescription_id THEN
      RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: % was approved against a different prescription',
        item.product_name
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (
         item.product_id IS NOT DISTINCT FROM item.approved_product_id
         OR (
           item.approved_generic_product_id IS NOT NULL
           AND item.product_id = item.approved_generic_product_id
           AND item.customer_choice IS NOT DISTINCT FROM 'SWITCH'
           AND item.consent_at IS NOT NULL
         )
       ) THEN
      RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: % is not the product the pharmacist approved (or the customer has not consented to the generic)',
        item.product_name
        USING ERRCODE = 'check_violation';
    END IF;

    IF item.rx_required THEN
      needs_prescription := true;
    END IF;

    IF NEW.status IN ('OUT_FOR_DELIVERY', 'DELIVERED')
       AND item.register_required
       AND NOT EXISTS (SELECT 1 FROM h1_register h WHERE h.order_item_id = item.id) THEN
      RAISE EXCEPTION 'NIRANTAR:REGISTER_MISSING: % needs an H1 register entry before handover',
        item.product_name
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF needs_prescription THEN
    SELECT review_status INTO prescription_status FROM prescriptions WHERE id = NEW.prescription_id;
    IF prescription_status IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'NIRANTAR:DISPATCH_BLOCKED: order % needs a pharmacist-verified prescription', NEW.number
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_dispatch_gate_on_update
  BEFORE UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status IN ('PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION nirantar_dispatch_gate();

CREATE TRIGGER orders_dispatch_gate_on_insert
  BEFORE INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.status IN ('PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'))
  EXECUTE FUNCTION nirantar_dispatch_gate();

-- ─────────────────────────────────────────────────────────────────────────────
-- Fulfilment and data-integrity CHECK constraints
-- ─────────────────────────────────────────────────────────────────────────────

-- A packed order has the store's invoice number.
ALTER TABLE orders ADD CONSTRAINT orders_invoice_when_packed
  CHECK (status NOT IN ('PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED') OR invoice_no IS NOT NULL);

-- Handover needs cash on delivery or a completed UPI payment (plan A8).
ALTER TABLE orders ADD CONSTRAINT orders_paid_before_handover
  CHECK (status NOT IN ('OUT_FOR_DELIVERY', 'DELIVERED') OR payment_method = 'COD' OR payment_status = 'PAID');

-- Assigned and later statuses always have a store.
ALTER TABLE orders ADD CONSTRAINT orders_store_when_assigned
  CHECK (status NOT IN ('ASSIGNED', 'PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED') OR store_id IS NOT NULL);

ALTER TABLE orders ADD CONSTRAINT orders_amounts_non_negative
  CHECK (subtotal_paise >= 0 AND total_paise >= 0);

ALTER TABLE order_items ADD CONSTRAINT order_items_quantities_valid
  CHECK (quantity > 0 AND requested_quantity > 0 AND unit_price_paise >= 0);

ALTER TABLE store_stock ADD CONSTRAINT store_stock_non_negative
  CHECK (on_hand >= 0 AND reserved >= 0);

ALTER TABLE products ADD CONSTRAINT products_pack_and_price_positive
  CHECK (pack_units > 0 AND price_paise > 0);

-- Pharmacists always have a registration number and a home store (plan A2).
ALTER TABLE users ADD CONSTRAINT users_pharmacist_details
  CHECK (role <> 'PHARMACIST' OR (pharmacist_reg_no IS NOT NULL AND store_id IS NOT NULL));

-- Customers sign in by phone; staff by email + password.
ALTER TABLE users ADD CONSTRAINT users_login_method
  CHECK (
    (role = 'CUSTOMER' AND phone IS NOT NULL)
    OR (role <> 'CUSTOMER' AND email IS NOT NULL AND password_hash IS NOT NULL)
  );

ALTER TABLE patients ADD CONSTRAINT patients_birth_year_range
  CHECK (birth_year IS NULL OR birth_year BETWEEN 1900 AND 2100);

ALTER TABLE addresses ADD CONSTRAINT addresses_pincode_format
  CHECK (pincode ~ '^[1-9][0-9]{5}$');

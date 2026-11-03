-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'PHARMACIST', 'OPS');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('en', 'hi', 'bn');

-- CreateEnum
CREATE TYPE "Schedule" AS ENUM ('OTC', 'H', 'H1', 'X', 'NDPS');

-- CreateEnum
CREATE TYPE "ProductForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'DROPS', 'CREAM', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "Relation" AS ENUM ('SELF', 'PARENT', 'SPOUSE', 'CHILD', 'SIBLING', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('AWAITING_PHARMACIST', 'ON_HOLD_REUPLOAD', 'AWAITING_CUSTOMER', 'APPROVED', 'AWAITING_STOCK', 'ASSIGNED', 'PICKING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('NEW', 'REFILL');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "CustomerChoice" AS ENUM ('KEEP', 'SWITCH');

-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('READING', 'READY', 'UNSURE', 'UNREADABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'VERIFIED', 'REUPLOAD_ASKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('COD', 'UPI_TEST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_DUE', 'DUE', 'PAID', 'FAILED', 'COD_PENDING', 'COD_COLLECTED', 'VOID', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PREVIEW', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "AccessAction" AS ENUM ('VIEW_IMAGE', 'AI_READ');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SENT', 'SKIPPED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "locale" "Locale" NOT NULL DEFAULT 'en',
    "store_id" UUID,
    "pharmacist_reg_no" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "consent_at" TIMESTAMP(3),
    "reminders_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "relation" "Relation" NOT NULL,
    "birth_year" INTEGER,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "locality_id" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "locality_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "molecule" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "form" "ProductForm" NOT NULL,
    "pack_label" TEXT NOT NULL,
    "pack_units" INTEGER NOT NULL,
    "price_paise" INTEGER NOT NULL,
    "schedule" "Schedule" NOT NULL,
    "is_generic" BOOLEAN NOT NULL DEFAULT false,
    "manufacturer" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_rules" (
    "schedule" "Schedule" NOT NULL,
    "rx_required" BOOLEAN NOT NULL,
    "register_required" BOOLEAN NOT NULL,
    "label" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_rules_pkey" PRIMARY KEY ("schedule")
);

-- CreateTable
CREATE TABLE "store_stock" (
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "counted_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_stock_pkey" PRIMARY KEY ("store_id","product_id")
);

-- CreateTable
CREATE TABLE "stock_imports" (
    "id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'PREVIEW',
    "rows" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "error_count" INTEGER NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "stock_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "replaces_id" UUID,
    "ai_status" "AiStatus" NOT NULL DEFAULT 'READING',
    "ai_started_at" TIMESTAMP(3),
    "ai_draft" JSONB,
    "ai_model" TEXT,
    "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "prescriber_name" TEXT,
    "prescriber_reg_no" TEXT,
    "prescribed_on" DATE,
    "patient_name_on_rx" TEXT,
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescription_files" (
    "prescription_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_files_pkey" PRIMARY KEY ("prescription_id")
);

-- CreateTable
CREATE TABLE "prescription_access_logs" (
    "id" UUID NOT NULL,
    "prescription_id" UUID NOT NULL,
    "user_id" UUID,
    "action" "AccessAction" NOT NULL,
    "order_id" UUID,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "prescription_id" UUID,
    "source" "OrderSource" NOT NULL DEFAULT 'NEW',
    "status" "OrderStatus" NOT NULL DEFAULT 'AWAITING_PHARMACIST',
    "version" INTEGER NOT NULL DEFAULT 1,
    "store_id" UUID,
    "preview_store_id" UUID,
    "delivery_address" JSONB NOT NULL,
    "delivery_lat" DOUBLE PRECISION NOT NULL,
    "delivery_lng" DOUBLE PRECISION NOT NULL,
    "customer_note" TEXT,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'COD',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'NOT_DUE',
    "subtotal_paise" INTEGER NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "reminders_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "invoice_no" TEXT,
    "rider_name" TEXT,
    "routing_note" TEXT,
    "promised_by" TIMESTAMP(3),
    "reviewing_by_id" UUID,
    "reviewing_at" TIMESTAMP(3),
    "verified_by_id" UUID,
    "verified_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "rejection_note" TEXT,
    "reupload_reason" TEXT,
    "placed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "requested_product_id" UUID NOT NULL,
    "requested_quantity" INTEGER NOT NULL,
    "unit_price_paise" INTEGER NOT NULL,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "removed_reason" TEXT,
    "as_written" TEXT,
    "dose_morning" DOUBLE PRECISION,
    "dose_noon" DOUBLE PRECISION,
    "dose_night" DOUBLE PRECISION,
    "dose_as_needed" BOOLEAN NOT NULL DEFAULT false,
    "duration_days" INTEGER,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_product_id" UUID,
    "approved_quantity" INTEGER,
    "approved_prescription_id" UUID,
    "approved_generic_product_id" UUID,
    "customer_choice" "CustomerChoice",
    "consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "actor_id" UUID,
    "actor_role" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "h1_register" (
    "id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "patient_name" TEXT NOT NULL,
    "patient_address" TEXT NOT NULL,
    "prescriber_name" TEXT NOT NULL,
    "prescriber_reg_no" TEXT NOT NULL,
    "pharmacist_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "supplied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "h1_register_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refill_subscriptions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "prescription_id" UUID,
    "last_order_id" UUID,
    "daily_units" DOUBLE PRECISION NOT NULL,
    "run_out_on" DATE NOT NULL,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "reminders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "confirmed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refill_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "cycle" INTEGER NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "status" "ReminderStatus" NOT NULL,
    "reason" TEXT,
    "message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "order_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "otp_codes_phone_created_at_idx" ON "otp_codes"("phone", "created_at");

-- CreateIndex
CREATE INDEX "session_expire_idx" ON "session"("expire");

-- CreateIndex
CREATE INDEX "patients_account_id_idx" ON "patients"("account_id");

-- CreateIndex
CREATE INDEX "addresses_account_id_idx" ON "addresses"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE INDEX "products_molecule_strength_form_idx" ON "products"("molecule", "strength", "form");

-- CreateIndex
CREATE INDEX "store_stock_product_id_idx" ON "store_stock"("product_id");

-- CreateIndex
CREATE INDEX "stock_imports_sha256_idx" ON "stock_imports"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "prescriptions_replaces_id_key" ON "prescriptions"("replaces_id");

-- CreateIndex
CREATE INDEX "prescriptions_patient_id_created_at_idx" ON "prescriptions"("patient_id", "created_at");

-- CreateIndex
CREATE INDEX "prescription_access_logs_prescription_id_at_idx" ON "prescription_access_logs"("prescription_id", "at");

-- CreateIndex
CREATE INDEX "prescription_access_logs_user_id_at_idx" ON "prescription_access_logs"("user_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_number_key" ON "orders"("number");

-- CreateIndex
CREATE INDEX "orders_account_id_placed_at_idx" ON "orders"("account_id", "placed_at");

-- CreateIndex
CREATE INDEX "orders_status_placed_at_idx" ON "orders"("status", "placed_at");

-- CreateIndex
CREATE INDEX "orders_store_id_status_idx" ON "orders"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_invoice_no_key" ON "orders"("store_id", "invoice_no");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_events_order_id_at_idx" ON "order_events"("order_id", "at");

-- CreateIndex
CREATE UNIQUE INDEX "h1_register_order_item_id_key" ON "h1_register"("order_item_id");

-- CreateIndex
CREATE INDEX "h1_register_supplied_at_idx" ON "h1_register"("supplied_at");

-- CreateIndex
CREATE INDEX "refill_subscriptions_is_active_run_out_on_idx" ON "refill_subscriptions"("is_active", "run_out_on");

-- CreateIndex
CREATE UNIQUE INDEX "refill_subscriptions_patient_id_product_id_key" ON "refill_subscriptions"("patient_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_message_id_key" ON "reminders"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminders_subscription_id_cycle_offset_days_key" ON "reminders"("subscription_id", "cycle", "offset_days");

-- CreateIndex
CREATE INDEX "messages_account_id_created_at_idx" ON "messages"("account_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_stock" ADD CONSTRAINT "store_stock_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_imports" ADD CONSTRAINT "stock_imports_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_replaces_id_fkey" FOREIGN KEY ("replaces_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_files" ADD CONSTRAINT "prescription_files_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_access_logs" ADD CONSTRAINT "prescription_access_logs_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_access_logs" ADD CONSTRAINT "prescription_access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_preview_store_id_fkey" FOREIGN KEY ("preview_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_reviewing_by_id_fkey" FOREIGN KEY ("reviewing_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_verified_by_id_fkey" FOREIGN KEY ("verified_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_requested_product_id_fkey" FOREIGN KEY ("requested_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_approved_product_id_fkey" FOREIGN KEY ("approved_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_approved_prescription_id_fkey" FOREIGN KEY ("approved_prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_approved_generic_product_id_fkey" FOREIGN KEY ("approved_generic_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "h1_register" ADD CONSTRAINT "h1_register_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "h1_register" ADD CONSTRAINT "h1_register_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "h1_register" ADD CONSTRAINT "h1_register_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "h1_register" ADD CONSTRAINT "h1_register_pharmacist_id_fkey" FOREIGN KEY ("pharmacist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "h1_register" ADD CONSTRAINT "h1_register_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT "refill_subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT "refill_subscriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT "refill_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT "refill_subscriptions_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refill_subscriptions" ADD CONSTRAINT "refill_subscriptions_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "refill_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

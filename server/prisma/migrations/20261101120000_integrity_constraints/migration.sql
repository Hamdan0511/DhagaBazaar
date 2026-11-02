-- Data-integrity constraints enforced by PostgreSQL itself, so no code path
-- (including future scripts or admin tools) can store impossible values.
-- Prisma does not model CHECK constraints; they do not cause schema drift.

ALTER TABLE "products"
  ADD CONSTRAINT "products_price_positive" CHECK ("pricePaise" > 0),
  ADD CONSTRAINT "products_moq_min" CHECK ("moq" >= 1),
  ADD CONSTRAINT "products_order_step_min" CHECK ("orderStep" >= 1),
  ADD CONSTRAINT "products_pieces_per_set_min" CHECK ("piecesPerSet" IS NULL OR "piecesPerSet" >= 1),
  ADD CONSTRAINT "products_lead_time_range" CHECK ("leadTimeDays" IS NULL OR "leadTimeDays" BETWEEN 0 AND 365);

ALTER TABLE "product_variants"
  ADD CONSTRAINT "product_variants_price_positive" CHECK ("pricePaise" IS NULL OR "pricePaise" > 0);

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_quantity_range" CHECK ("quantity" BETWEEN 1 AND 1000000);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_subtotal_non_negative" CHECK ("subtotalPaise" >= 0);

ALTER TABLE "supplier_orders"
  ADD CONSTRAINT "supplier_orders_subtotal_non_negative" CHECK ("subtotalPaise" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_min" CHECK ("quantity" >= 1),
  ADD CONSTRAINT "order_items_moq_min" CHECK ("moqAtOrder" >= 1),
  ADD CONSTRAINT "order_items_unit_price_non_negative" CHECK ("unitPricePaise" >= 0),
  ADD CONSTRAINT "order_items_line_total_non_negative" CHECK ("lineTotalPaise" >= 0);

ALTER TABLE "commissions"
  ADD CONSTRAINT "commissions_rate_range" CHECK ("rateBps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "commissions_amount_non_negative" CHECK ("amountPaise" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_non_negative" CHECK ("amountPaise" >= 0);

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_min_order_value_non_negative" CHECK ("minOrderValuePaise" IS NULL OR "minOrderValuePaise" >= 0);

ALTER TABLE "enquiries"
  ADD CONSTRAINT "enquiries_quantity_min" CHECK ("quantity" IS NULL OR "quantity" >= 1);

-- Product photos are looked up by storage key when served through the review gate.
CREATE INDEX "product_images_storageKey_idx" ON "product_images"("storageKey");

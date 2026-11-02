-- Inventory tracking. Purely additive: nullable columns (NULL = stock not tracked),
-- so every existing listing keeps working exactly as before.
ALTER TABLE "products" ADD COLUMN "stockQuantity" INTEGER;
ALTER TABLE "product_variants" ADD COLUMN "stockQuantity" INTEGER;

ALTER TABLE "products" ADD CONSTRAINT "products_stock_non_negative" CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_non_negative" CHECK ("stockQuantity" IS NULL OR "stockQuantity" >= 0);

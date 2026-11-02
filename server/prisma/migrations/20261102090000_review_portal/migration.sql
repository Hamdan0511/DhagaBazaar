-- Admin review portal, product photo dimensions and optional volume pricing.
-- Additive only: one new enum value, nullable columns and a column with a default.
-- Existing rows are untouched (new columns are NULL / '[]').

ALTER TYPE "SupplierStatus" ADD VALUE IF NOT EXISTS 'INFO_REQUESTED' AFTER 'PENDING_REVIEW';

ALTER TABLE "suppliers"
  ADD COLUMN "infoRequest" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Backfill approvedAt for suppliers that are already approved, from their last review time.
UPDATE "suppliers" SET "approvedAt" = "reviewedAt" WHERE "status" = 'APPROVED' AND "approvedAt" IS NULL;

ALTER TABLE "products" ADD COLUMN "priceTiers" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "product_images"
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER;

ALTER TABLE "product_images"
  ADD CONSTRAINT "product_images_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0));

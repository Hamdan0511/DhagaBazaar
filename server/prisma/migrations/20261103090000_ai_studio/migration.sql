-- CreateEnum
CREATE TYPE "AiAnalysisStatus" AS ENUM ('NOT_STARTED', 'ANALYSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('GENERATING', 'COMPLETED', 'FAILED', 'ACCEPTED', 'DISCARDED');

-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "aiEnhanced" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sha256" TEXT;

-- CreateTable
CREATE TABLE "ai_source_photos" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productId" TEXT,
    "productImageId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "analysisStatus" "AiAnalysisStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "analysis" JSONB,
    "analysisModel" TEXT,
    "analysisError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_source_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'GENERATING',
    "background" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "garmentType" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "categoryPath" TEXT,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "storageKey" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "productImageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_source_photos_supplierId_createdAt_idx" ON "ai_source_photos"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_source_photos_supplierId_sha256_idx" ON "ai_source_photos"("supplierId", "sha256");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generations_productImageId_key" ON "ai_generations"("productImageId");

-- CreateIndex
CREATE INDEX "ai_generations_supplierId_createdAt_idx" ON "ai_generations"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_generations_supplierId_status_idx" ON "ai_generations"("supplierId", "status");

-- CreateIndex
CREATE INDEX "ai_generations_sourceId_idx" ON "ai_generations"("sourceId");

-- AddForeignKey
ALTER TABLE "ai_source_photos" ADD CONSTRAINT "ai_source_photos_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_source_photos" ADD CONSTRAINT "ai_source_photos_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ai_source_photos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_productImageId_fkey" FOREIGN KEY ("productImageId") REFERENCES "product_images"("id") ON DELETE SET NULL ON UPDATE CASCADE;


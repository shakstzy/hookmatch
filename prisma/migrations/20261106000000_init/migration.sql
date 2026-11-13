-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hit" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "angleId" TEXT NOT NULL DEFAULT '',
    "arm" TEXT NOT NULL,
    "adId" TEXT NOT NULL DEFAULT '',
    "adName" TEXT NOT NULL DEFAULT '',
    "adsetId" TEXT NOT NULL DEFAULT '',
    "adsetName" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Hit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL DEFAULT '',
    "adsetId" TEXT NOT NULL DEFAULT '',
    "adsetName" TEXT NOT NULL DEFAULT '',
    "campaignId" TEXT NOT NULL DEFAULT '',
    "campaignName" TEXT NOT NULL DEFAULT '',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribution" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL DEFAULT '',
    "arm" TEXT NOT NULL DEFAULT '',
    "adId" TEXT NOT NULL DEFAULT '',
    "total" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hit_shop_day_idx" ON "Hit"("shop", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Hit_shop_day_angleId_arm_adId_key" ON "Hit"("shop", "day", "angleId", "arm", "adId");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_shop_adId_key" ON "Ad"("shop", "adId");

-- CreateIndex
CREATE INDEX "Attribution_shop_createdAt_idx" ON "Attribution"("shop", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attribution_shop_orderId_key" ON "Attribution"("shop", "orderId");


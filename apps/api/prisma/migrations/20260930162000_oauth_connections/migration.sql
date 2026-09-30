CREATE TABLE "OAuthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OAuthConnection_userId_provider_key" ON "OAuthConnection"("userId", "provider");
CREATE INDEX "OAuthConnection_provider_externalId_idx" ON "OAuthConnection"("provider", "externalId");

ALTER TABLE "OAuthConnection" ADD CONSTRAINT "OAuthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

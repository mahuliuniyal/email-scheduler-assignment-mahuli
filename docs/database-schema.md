# Database Schema (Prisma)

This schema represents the durable source of truth for the application.

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id             String    @id @default(uuid())
  email          String    @unique
  name           String?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  oauthTokens    OAuthToken[]
  campaigns      Campaign[]
}

model OAuthToken {
  id             String    @id @default(uuid())
  userId         String
  provider       String    // "google", "slack"
  accessToken    String
  refreshToken   String?
  expiresAt      DateTime?
  
  user           User      @relation(fields: [userId], references: [id])

  @@unique([userId, provider])
}

model Campaign {
  id                String     @id @default(uuid())
  userId            String
  name              String
  subjectTemplate   String
  bodyTemplate      String
  hourlyLimit       Int        @default(50)
  minDelaySeconds   Int        @default(10)
  createdAt         DateTime   @default(now())
  
  user              User       @relation(fields: [userId], references: [id])
  leads             Lead[]
  emailJobs         EmailJob[]
}

model Lead {
  id             String     @id @default(uuid())
  campaignId     String
  email          String
  firstName      String?
  lastName       String?
  metadata       Json?      // Store extra CSV columns

  campaign       Campaign   @relation(fields: [campaignId], references: [id])
  emailJobs      EmailJob[]

  @@unique([campaignId, email])
}

enum JobStatus {
  PENDING
  SCHEDULED
  SENDING
  SENT
  FAILED
}

model EmailJob {
  id             String     @id @default(uuid())
  campaignId     String
  leadId         String
  status         JobStatus  @default(PENDING)
  scheduledFor   DateTime
  sentAt         DateTime?
  errorLog       String?
  idempotencyKey String     @unique // e.g., hash(campaignId + leadId + scheduledFor)

  campaign       Campaign   @relation(fields: [campaignId], references: [id])
  lead           Lead       @relation(fields: [leadId], references: [id])

  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
}
```

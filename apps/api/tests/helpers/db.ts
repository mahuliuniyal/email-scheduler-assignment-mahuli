import { prisma } from '../../src/utils/prisma';

export async function cleanDatabase() {
  await prisma.emailOutbox.deleteMany({});
  await prisma.emailJob.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.$executeRawUnsafe('DELETE FROM "OAuthConnection"');
  await prisma.senderAccount.deleteMany({});
  await prisma.user.deleteMany({});
}

export async function createTestCampaign(overrides: Record<string, unknown> = {}) {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = await prisma.user.create({ data: { email: `test-${unique}@example.com`, name: 'Test User' } });
  const sender = await prisma.senderAccount.create({
    data: {
      userId: user.id,
      provider: 'test',
      email: `sender-${unique}@example.com`,
      accessToken: 'test-access-token',
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      senderAccountId: sender.id,
      name: 'Test Campaign',
      subjectTemplate: 'Hello {{firstName}}',
      bodyTemplate: '<p>Body {{firstName}}</p>',
      hourlyLimit: 1000,
      minDelaySeconds: 0,
      ...(overrides as any),
    },
  });
  return { user, sender, campaign };
}

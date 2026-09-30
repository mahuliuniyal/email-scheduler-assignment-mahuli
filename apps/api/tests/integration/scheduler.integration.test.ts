import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/utils/prisma';
import { redis } from '../../src/utils/redis';
import { emailQueue, esQueue, outboxQueue } from '../../src/services/queue.service';
import { setupEmailWorker } from '../../src/workers/email.worker';
import { setupOutboxWorker, dispatchPendingOutboxOnce } from '../../src/workers/outbox-dispatcher.worker';
import { cleanDatabase, createTestCampaign } from '../helpers/db';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(fn: () => Promise<boolean>, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await fn()) return true;
    await wait(100);
  }
  return false;
}

describe('Scheduler integration', () => {
  let emailWorker: ReturnType<typeof setupEmailWorker>;
  let outboxWorker: ReturnType<typeof setupOutboxWorker>;

  beforeAll(async () => {
    await prisma.$connect();
    await redis.flushdb();
    emailWorker = setupEmailWorker();
    outboxWorker = setupOutboxWorker();
  });

  beforeEach(async () => {
    await cleanDatabase();
    await redis.flushdb();
  });

  afterAll(async () => {
    await emailWorker.close();
    await outboxWorker.close();
    await emailQueue.close();
    await esQueue.close();
    await outboxQueue.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  test('persists job and outbox transactionally', async () => {
    const { campaign } = await createTestCampaign();
    const res = await request(app)
      .post('/api/campaigns/schedule')
      .send({ campaignId: campaign.id, leads: [{ email: 'alice@example.com', firstName: 'Alice' }], scheduledFor: new Date().toISOString() });
    expect(res.status).toBe(200);
    const job = await prisma.emailJob.findFirst({ where: { campaignId: campaign.id } });
    expect(job).toBeTruthy();
    const outbox = await prisma.emailOutbox.findUnique({ where: { emailJobId: job!.id } });
    expect(outbox?.status).toBe('PENDING');
    await dispatchPendingOutboxOnce();
    const bull = await emailQueue.getJob(job!.idempotencyKey);
    expect(bull?.id).toBe(job!.idempotencyKey);
  });

  test('duplicate scheduling remains idempotent', async () => {
    const { campaign } = await createTestCampaign();
    const payload = { campaignId: campaign.id, leads: [{ email: 'bob@example.com', firstName: 'Bob' }], scheduledFor: new Date().toISOString() };
    await request(app).post('/api/campaigns/schedule').send(payload);
    await request(app).post('/api/campaigns/schedule').send(payload);
    expect(await prisma.emailJob.count({ where: { campaignId: campaign.id } })).toBe(1);
    await dispatchPendingOutboxOnce();
    const jobs = await emailQueue.getJobs(['waiting', 'delayed', 'active', 'completed', 'failed']);
    expect(jobs).toHaveLength(1);
  });

  test('rate limit reschedules instead of dropping', async () => {
    const { campaign } = await createTestCampaign({ hourlyLimit: 1, minDelaySeconds: 0 });
    await request(app).post('/api/campaigns/schedule').send({ campaignId: campaign.id, leads: [{ email: 'a@example.com' }], scheduledFor: new Date().toISOString() });
    await request(app).post('/api/campaigns/schedule').send({ campaignId: campaign.id, leads: [{ email: 'b@example.com' }], scheduledFor: new Date().toISOString() });
    await dispatchPendingOutboxOnce();
    await waitFor(async () => {
      const first = await prisma.emailJob.findFirst({ where: { lead: { email: 'a@example.com' } } });
      return first?.status === 'SENT';
    });
    const second = await prisma.emailJob.findFirst({ where: { lead: { email: 'b@example.com' } } });
    const queued = await emailQueue.getJob(second!.idempotencyKey);
    expect(queued).toBeTruthy();
    expect(await queued!.getState()).toBe('delayed');
  });
});

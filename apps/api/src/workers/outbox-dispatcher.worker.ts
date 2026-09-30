import { Worker, Job } from 'bullmq';
import { prisma } from '../utils/prisma';
import { emailQueue, outboxQueue } from '../services/queue.service';
import { redis } from '../utils/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export async function dispatchPendingOutboxOnce() {
  const rows = await prisma.emailOutbox.findMany({
    where: { status: 'PENDING' },
    include: {
      emailJob: {
        select: { id: true, idempotencyKey: true, scheduledFor: true },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  for (const row of rows) {
    const delay = Math.max(0, row.emailJob.scheduledFor.getTime() - Date.now());
    try {
      await emailQueue.add('send-email', { emailJobId: row.emailJob.id }, {
        jobId: row.emailJob.idempotencyKey,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10000 },
        removeOnFail: { age: 30 * 24 * 60 * 60, count: 10000 },
      });
      await prisma.emailOutbox.updateMany({
        where: { id: row.id, status: 'PENDING' },
        data: { status: 'DISPATCHED' },
      });
    } catch (error) {
      logger.error(`Outbox dispatch failed for ${row.id}`, error);
    }
  }

  return rows.length;
}

export const setupOutboxWorker = () => {
  const worker = new Worker('outbox-dispatch-queue', async (job: Job) => {
    await dispatchPendingOutboxOnce();
    if (config.NODE_ENV !== 'test') {
      await outboxQueue.add('outbox-poll', {}, {
        delay: config.OUTBOX_POLL_MS,
        jobId: `poll-${Date.now()}`,
      });
    }
  }, { connection: redis, concurrency: 1 });

  worker.on('error', (err) => logger.error('Outbox worker error:', err));
  return worker;
};

export async function startOutboxScheduler() {
  if (config.NODE_ENV === 'test') return;
  await outboxQueue.add('outbox-poll', {}, { delay: 0, jobId: `bootstrap-${Date.now()}` });
}

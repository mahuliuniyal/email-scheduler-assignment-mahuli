import { Queue } from 'bullmq';
import { redis } from '../utils/redis';

const keepCompleted = { age: 7 * 24 * 60 * 60, count: 10000 };
const keepFailed = { age: 30 * 24 * 60 * 60, count: 10000 };

export const emailQueue = new Queue('email-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: keepCompleted,
    removeOnFail: keepFailed,
  },
});

export const esQueue = new Queue('es-sync-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 5000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 },
  },
});

export const outboxQueue = new Queue('outbox-dispatch-queue', {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
    removeOnComplete: { age: 60 * 60, count: 100 },
    removeOnFail: { age: 24 * 60 * 60, count: 100 },
  },
});

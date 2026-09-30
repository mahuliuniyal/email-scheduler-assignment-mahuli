import { app } from './app';
import { config } from './config';
import { prisma } from './utils/prisma';
import { redis } from './utils/redis';
import { emailQueue, esQueue, outboxQueue } from './services/queue.service';
import { setupEmailWorker } from './workers/email.worker';
import { setupEsWorker } from './workers/es.worker';
import { setupOutboxWorker, startOutboxScheduler } from './workers/outbox-dispatcher.worker';
import { ensureEmailIndex } from './utils/elasticsearch';

async function start() {
  try {
    await prisma.$connect();
    await redis.ping();
    await ensureEmailIndex().catch((error) => console.warn('Elasticsearch is unavailable at startup:', error.message));

    const workers = [setupEmailWorker(), setupEsWorker(), setupOutboxWorker()];
    await startOutboxScheduler();

    const server = app.listen(config.PORT, () => {
      console.log(`Email Scheduler API listening on http://localhost:${config.PORT}`);
      console.log(`Bull Board available at http://localhost:${config.PORT}/admin/queues`);
    });

    const shutdown = async () => {
      server.close();
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all([emailQueue.close(), esQueue.close(), outboxQueue.close()]);
      await redis.quit();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();

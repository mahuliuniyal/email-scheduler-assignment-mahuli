import { Worker, Job } from 'bullmq';
import { redis } from '../utils/redis';
import { prisma } from '../utils/prisma';
import { esClient, EMAIL_INDEX, ensureEmailIndex } from '../utils/elasticsearch';
import { logger } from '../utils/logger';

export const setupEsWorker = () => {
  const worker = new Worker('es-sync-queue', async (job: Job) => {
    const { emailJobId } = job.data as { emailJobId: string };
    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: { campaign: true, lead: true },
    });
    if (!emailJob) return;

    await ensureEmailIndex();
    await esClient.index({
      index: EMAIL_INDEX,
      id: emailJob.id,
      document: {
        id: emailJob.id,
        campaignId: emailJob.campaignId,
        campaignName: emailJob.campaign.name,
        leadId: emailJob.leadId,
        leadEmail: emailJob.lead.email,
        subject: emailJob.campaign.subjectTemplate,
        body: emailJob.campaign.bodyTemplate,
        status: emailJob.status,
        scheduledFor: emailJob.scheduledFor.toISOString(),
        sentAt: emailJob.sentAt?.toISOString() ?? null,
        createdAt: emailJob.createdAt.toISOString(),
      },
      refresh: 'wait_for',
    });
  }, { connection: redis, concurrency: 2 });

  worker.on('error', (err) => logger.error('ES Worker Error:', err));
  return worker;
};

import { DelayedError, Job, Worker } from 'bullmq';
import { redis } from '../utils/redis';
import { prisma } from '../utils/prisma';
import { config } from '../config';
import { RateLimitService } from '../services/rate-limit.service';
import { EmailService } from '../services/email.service';
import { esQueue } from '../services/queue.service';
import { notifySlackRateLimit } from '../services/slack.service';
import { logger } from '../utils/logger';

export const setupEmailWorker = () => {
  const worker = new Worker('email-queue', async (job: Job, token?: string) => {
    const { emailJobId } = job.data as { emailJobId: string };

    const emailJob = await prisma.emailJob.findUnique({
      where: { id: emailJobId },
      include: { campaign: true, lead: true },
    });

    if (!emailJob) return;
    if (emailJob.status === 'SENT') return;

    if (emailJob.status === 'SENDING') {
      const leaseExpired = !emailJob.sendingLeaseExpiresAt || emailJob.sendingLeaseExpiresAt.getTime() <= Date.now();
      if (!leaseExpired) return;
      await prisma.emailJob.updateMany({
        where: { id: emailJobId, status: 'SENDING' },
        data: { status: 'SCHEDULED', processingStartedAt: null, sendingLeaseExpiresAt: null },
      });
    }

    const reserve = await RateLimitService.reserveSend(
      emailJob.campaign.senderAccountId,
      emailJob.campaign.hourlyLimit || config.MAX_EMAILS_PER_HOUR_PER_SENDER,
      emailJob.campaign.minDelaySeconds * 1000,
    );

    if (!reserve.allowed) {
      if (reserve.reason === 'hourly' && reserve.resetTime) {
        try {
          await notifySlackRateLimit(
            await prisma.user.findUniqueOrThrow({ where: { id: emailJob.campaign.userId } }),
            emailJob.campaignId,
            reserve.resetTime,
          );
        } catch (error) {
          logger.warn('Slack alert skipped/failed:', error);
        }
      }

      const delay = reserve.reason === 'hourly'
        ? Math.max(1000, (reserve.resetTime ?? Date.now() + 60000) - Date.now())
        : Math.max(1000, reserve.remainingDelayMs ?? config.MIN_SEND_DELAY_MS);

      if (!token) throw new Error('BullMQ lock token unavailable while rescheduling');
      await job.moveToDelayed(Date.now() + delay, token);
      throw new DelayedError();
    }

    const now = new Date();
    const leaseExpires = new Date(now.getTime() + config.SENDING_LEASE_MS);
    const claim = await prisma.emailJob.updateMany({
      where: {
        id: emailJobId,
        status: { in: ['PENDING', 'SCHEDULED', 'FAILED'] },
      },
      data: {
        status: 'SENDING',
        attempts: { increment: 1 },
        processingStartedAt: now,
        sendingLeaseExpiresAt: leaseExpires,
        errorLog: null,
      },
    });

    if (claim.count !== 1) return;

    try {
      const firstName = emailJob.lead.firstName || '';
      const subject = emailJob.campaign.subjectTemplate.replace(/\{\{\s*firstName\s*\}\}/gi, firstName);
      const body = emailJob.campaign.bodyTemplate.replace(/\{\{\s*firstName\s*\}\}/gi, firstName);

      await EmailService.sendEmail(emailJob.lead.email, subject, body);

      const sent = await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          processingStartedAt: null,
          sendingLeaseExpiresAt: null,
        },
      });

      await esQueue.add('sync-es', { emailJobId: sent.id });
    } catch (error) {
      await prisma.emailJob.update({
        where: { id: emailJobId },
        data: {
          status: 'FAILED',
          errorLog: error instanceof Error ? error.message : 'Unknown SMTP error',
          processingStartedAt: null,
          sendingLeaseExpiresAt: null,
        },
      });
      throw error;
    }
  }, {
    connection: redis,
    concurrency: config.WORKER_CONCURRENCY,
  });

  worker.on('error', (err) => logger.error('Email Worker Error:', err));
  return worker;
};

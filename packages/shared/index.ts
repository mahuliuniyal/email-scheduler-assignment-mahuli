import { z } from 'zod';

export const LeadSchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

export const ScheduleEmailSchema = z.object({
  campaignId: z.string().uuid(),
  leads: z.array(LeadSchema).min(1),
  scheduledFor: z.string().datetime(),
});

export const CreateCampaignSchema = z.object({
  name: z.string().trim().min(1).max(120),
  senderAccountId: z.string().uuid(),
  subjectTemplate: z.string().min(1).max(500),
  bodyTemplate: z.string().min(1).max(10000),
  hourlyLimit: z.number().int().min(1).max(100000).default(50),
  minDelaySeconds: z.number().int().min(0).max(3600).default(2),
});

export const LeadUploadSchema = z.object({
  leads: z.array(LeadSchema).min(1),
});

export type ScheduleEmailRequest = z.infer<typeof ScheduleEmailSchema>;
export type CreateCampaignRequest = z.infer<typeof CreateCampaignSchema>;
export type Lead = z.infer<typeof LeadSchema>;

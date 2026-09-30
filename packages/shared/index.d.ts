import { z } from 'zod';
export declare const LeadSchema: z.ZodObject<any>;
export declare const ScheduleEmailSchema: z.ZodObject<any>;
export declare const CreateCampaignSchema: z.ZodObject<any>;
export declare const LeadUploadSchema: z.ZodObject<any>;
export type ScheduleEmailRequest = { campaignId: string; leads: Array<{ email: string; firstName?: string; lastName?: string }>; scheduledFor: string };
export type CreateCampaignRequest = { name: string; senderAccountId: string; subjectTemplate: string; bodyTemplate: string; hourlyLimit: number; minDelaySeconds: number };
export type Lead = { email: string; firstName?: string; lastName?: string };

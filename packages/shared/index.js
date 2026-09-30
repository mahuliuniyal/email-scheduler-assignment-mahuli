const { z } = require('zod');
exports.LeadSchema = z.object({ email: z.string().email(), firstName: z.string().optional(), lastName: z.string().optional() });
exports.ScheduleEmailSchema = z.object({ campaignId: z.string().uuid(), leads: z.array(exports.LeadSchema).min(1), scheduledFor: z.string().datetime() });
exports.CreateCampaignSchema = z.object({ name: z.string().trim().min(1).max(120), senderAccountId: z.string().uuid(), subjectTemplate: z.string().min(1).max(500), bodyTemplate: z.string().min(1).max(10000), hourlyLimit: z.number().int().min(1).max(100000).default(50), minDelaySeconds: z.number().int().min(0).max(3600).default(2) });
exports.LeadUploadSchema = z.object({ leads: z.array(exports.LeadSchema).min(1) });

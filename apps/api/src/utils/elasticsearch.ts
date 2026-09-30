import { Client } from '@elastic/elasticsearch';
import { config } from '../config';

export const EMAIL_INDEX = 'emails';
export const esClient = new Client({ node: config.ELASTICSEARCH_URL });

export type EmailDocument = {
  id: string;
  campaignId: string;
  campaignName: string;
  leadId: string;
  leadEmail: string;
  subject: string;
  body: string;
  status: string;
  scheduledFor: string;
  sentAt?: string | null;
  createdAt: string;
};

export async function ensureEmailIndex() {
  const exists = await esClient.indices.exists({ index: EMAIL_INDEX });
  if (!exists) {
    await esClient.indices.create({
      index: EMAIL_INDEX,
      mappings: {
        properties: {
          campaignId: { type: 'keyword' },
          campaignName: { type: 'text' },
          leadId: { type: 'keyword' },
          leadEmail: { type: 'keyword' },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          scheduledFor: { type: 'date' },
          sentAt: { type: 'date' },
          createdAt: { type: 'date' },
        },
      },
    });
  }
}

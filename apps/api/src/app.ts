import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import apiRoutes from './routes/api.routes';
import { config } from './config';
import { emailQueue, esQueue, outboxQueue } from './services/queue.service';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const app = express();

app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [
    new BullMQAdapter(emailQueue) as any,
    new BullMQAdapter(esQueue) as any,
    new BullMQAdapter(outboxQueue) as any,
  ],
  serverAdapter,
});

app.use('/admin/queues', serverAdapter.getRouter());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'email-scheduler-api' }));
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('API Error:', err);
  if (err?.name === 'ZodError') return res.status(400).json({ error: 'Validation Error', details: err.errors });
  return res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

export { app };

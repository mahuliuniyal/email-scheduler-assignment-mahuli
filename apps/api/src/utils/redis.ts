import IORedis from 'ioredis';
import { config } from '../config';

export const redis = new IORedis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

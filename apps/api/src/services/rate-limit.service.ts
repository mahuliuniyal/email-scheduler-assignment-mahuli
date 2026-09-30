import { redis } from '../utils/redis';

export type ReservationResult = {
  allowed: boolean;
  reason?: 'hourly' | 'minDelay';
  resetTime?: number;
  remainingDelayMs?: number;
};

export class RateLimitService {
  static async reserveSend(
    senderAccountId: string,
    maxEmailsPerHour: number,
    minDelayMs: number,
  ): Promise<ReservationResult> {
    const now = Date.now();
    const hour = new Date(now);
    const hourKey = `ratelimit:email:${senderAccountId}:${hour.getUTCFullYear()}-${hour.getUTCMonth() + 1}-${hour.getUTCDate()}-${hour.getUTCHours()}`;
    const delayKey = `ratelimit:last-sent:${senderAccountId}`;

    const nextHour = new Date(now);
    nextHour.setUTCMinutes(0, 0, 0);
    nextHour.setUTCHours(nextHour.getUTCHours() + 1);

    const script = `
      local count = tonumber(redis.call('GET', KEYS[1]) or '0')
      local lastSent = tonumber(redis.call('GET', KEYS[2]) or '0')
      local now = tonumber(ARGV[1])
      local maxPerHour = tonumber(ARGV[2])
      local minDelay = tonumber(ARGV[3])
      local resetTime = tonumber(ARGV[4])

      if count >= maxPerHour then
        return {0, resetTime, 0}
      end

      local elapsed = now - lastSent
      if minDelay > 0 and elapsed < minDelay then
        return {0, 0, minDelay - elapsed}
      end

      local newCount = redis.call('INCR', KEYS[1])
      if newCount == 1 then
        redis.call('EXPIRE', KEYS[1], 3700)
      end

      if minDelay > 0 then
        redis.call('SET', KEYS[2], now, 'PX', minDelay)
      end

      return {1, 0, 0}
    `;

    const result = (await redis.eval(
      script,
      2,
      hourKey,
      delayKey,
      String(now),
      String(maxEmailsPerHour),
      String(minDelayMs),
      String(nextHour.getTime()),
    )) as number[];

    const [allowed, resetTime, remainingDelayMs] = result.map(Number);

    if (allowed === 1) return { allowed: true };
    if (resetTime > 0) {
      return { allowed: false, reason: 'hourly', resetTime };
    }

    return {
      allowed: false,
      reason: 'minDelay',
      remainingDelayMs: Math.max(1, remainingDelayMs),
    };
  }

  // Small public helpers retained for unit tests and dashboard diagnostics.
  static async checkHourlyLimit(senderAccountId: string, maxEmailsPerHour: number) {
    const result = await this.reserveSend(senderAccountId, maxEmailsPerHour, 0);
    return { allowed: result.allowed, resetTime: result.resetTime };
  }

  static async checkMinDelay(senderAccountId: string, minDelayMs: number) {
    const delayKey = `ratelimit:last-sent:${senderAccountId}`;
    const now = Date.now();
    const script = `
      local last = tonumber(redis.call('GET', KEYS[1]) or '0')
      local now = tonumber(ARGV[1])
      local delay = tonumber(ARGV[2])
      if delay <= 0 then return -1 end
      if now - last >= delay then
        redis.call('SET', KEYS[1], now, 'PX', delay)
        return -1
      end
      return delay - (now - last)
    `;
    const remaining = Number(await redis.eval(script, 1, delayKey, String(now), String(minDelayMs)));
    return remaining === -1
      ? { allowed: true }
      : { allowed: false, remainingDelayMs: remaining };
  }
}

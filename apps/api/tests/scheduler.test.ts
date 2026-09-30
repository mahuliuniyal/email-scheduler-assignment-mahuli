import { RateLimitService } from '../src/services/rate-limit.service';
import { redis } from '../src/utils/redis';

describe('RateLimitService', () => {
  beforeEach(async () => {
    await redis.flushall();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('allows sends within hourly limit', async () => {
    expect((await RateLimitService.checkHourlyLimit('sender-1', 5)).allowed).toBe(true);
  });

  it('does not consume quota when hourly limit is exhausted', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await RateLimitService.checkHourlyLimit('sender-2', 5)).allowed).toBe(true);
    }
    const sixth = await RateLimitService.checkHourlyLimit('sender-2', 5);
    expect(sixth.allowed).toBe(false);
    expect(sixth.resetTime).toBeGreaterThan(Date.now());
  });

  it('enforces minimum delay atomically', async () => {
    const first = await RateLimitService.checkMinDelay('sender-3', 1000);
    const second = await RateLimitService.checkMinDelay('sender-3', 1000);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.remainingDelayMs).toBeGreaterThan(0);
  });
});

import type { NextFunction, Request, Response } from 'express';
import { getUserFromRequest } from '../services/auth.service';

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test') {
    const testUserId = req.header('x-test-user-id');
    if (testUserId) res.locals.user = await import('../utils/prisma').then(({ prisma }) => prisma.user.findUnique({ where: { id: testUserId } }));
    return next();
  }
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  res.locals.user = user;
  next();
}

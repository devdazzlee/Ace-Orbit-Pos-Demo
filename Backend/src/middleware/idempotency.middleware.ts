import { Request, Response, NextFunction } from 'express';

interface CachedResponse {
  statusCode: number;
  body: any;
  timestamp: number;
}

const cache = new Map<string, CachedResponse>();
const TTL_MS = 5 * 60 * 1000; // 5 minutes

function evictExpired() {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (now - value.timestamp > TTL_MS) cache.delete(key);
  }
}

export function idempotency(req: Request, res: Response, next: NextFunction) {
  const operationId = req.headers['x-operation-id'] as string | undefined;
  if (!operationId) return next();

  evictExpired();

  const cached = cache.get(operationId);
  if (cached) {
    return res.status(cached.statusCode).json(cached.body);
  }

  // Intercept res.json to capture the response for caching
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      cache.set(operationId, { statusCode: res.statusCode, body, timestamp: Date.now() });
    }
    return originalJson(body);
  };

  next();
}

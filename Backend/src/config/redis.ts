// Redis has been removed. Sessions are now stored in PostgreSQL via Prisma.
// This stub is kept so that any forgotten import does not cause a build error.

export const isRedisAvailable = false;

export const safeRedisOperation = async <T>(
  _operation: (redis: never) => Promise<T>,
  fallback: T
): Promise<T> => fallback;

export const connectRedis = async () => {};
export const getRedis = () => null;

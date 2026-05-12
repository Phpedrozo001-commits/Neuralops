import Redis from 'ioredis';
import env from '../config/env.js';
import logger from '../config/logger.js';

let redis = null;

/**
 * Initialize Redis connection
 */
export async function initializeCache() {
  if (!env.REDIS_ENABLED) {
    logger.info('Redis caching disabled');
    return null;
  }

  if (redis) {
    return redis;
  }

  try {
    redis = new Redis(env.REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null,
    });

    redis.on('connect', () => {
      logger.info('✅ Redis connected');
    });

    redis.on('error', (error) => {
      logger.error('Redis error', { error: error.message });
    });

    // Test connection
    await redis.ping();
    logger.info('✅ Redis cache initialized');

    return redis;
  } catch (error) {
    logger.error('Failed to initialize Redis', { error: error.message });
    return null;
  }
}

/**
 * Get value from cache
 */
export async function get(key) {
  if (!redis) return null;

  try {
    const value = await redis.get(key);
    if (value) {
      logger.debug('Cache hit', { key });
      return JSON.parse(value);
    }
    logger.debug('Cache miss', { key });
    return null;
  } catch (error) {
    logger.error('Cache get error', { key, error: error.message });
    return null;
  }
}

/**
 * Set value in cache
 */
export async function set(key, value, ttlSeconds = 3600) {
  if (!redis) return false;

  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    logger.debug('Cache set', { key, ttl: ttlSeconds });
    return true;
  } catch (error) {
    logger.error('Cache set error', { key, error: error.message });
    return false;
  }
}

/**
 * Delete value from cache
 */
export async function del(key) {
  if (!redis) return false;

  try {
    await redis.del(key);
    logger.debug('Cache deleted', { key });
    return true;
  } catch (error) {
    logger.error('Cache delete error', { key, error: error.message });
    return false;
  }
}

/**
 * Clear all cache
 */
export async function flush() {
  if (!redis) return false;

  try {
    await redis.flushdb();
    logger.info('Cache flushed');
    return true;
  } catch (error) {
    logger.error('Cache flush error', { error: error.message });
    return false;
  }
}

/**
 * Increment counter
 */
export async function increment(key, amount = 1) {
  if (!redis) return null;

  try {
    const value = await redis.incrby(key, amount);
    return value;
  } catch (error) {
    logger.error('Cache increment error', { key, error: error.message });
    return null;
  }
}

/**
 * Decrement counter
 */
export async function decrement(key, amount = 1) {
  if (!redis) return null;

  try {
    const value = await redis.decrby(key, amount);
    return value;
  } catch (error) {
    logger.error('Cache decrement error', { key, error: error.message });
    return null;
  }
}

/**
 * Check if key exists
 */
export async function exists(key) {
  if (!redis) return false;

  try {
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    logger.error('Cache exists error', { key, error: error.message });
    return false;
  }
}

/**
 * Get TTL of key
 */
export async function ttl(key) {
  if (!redis) return -1;

  try {
    return await redis.ttl(key);
  } catch (error) {
    logger.error('Cache ttl error', { key, error: error.message });
    return -1;
  }
}

/**
 * Set TTL of key
 */
export async function expire(key, seconds) {
  if (!redis) return false;

  try {
    const result = await redis.expire(key, seconds);
    return result === 1;
  } catch (error) {
    logger.error('Cache expire error', { key, error: error.message });
    return false;
  }
}

/**
 * Get multiple keys
 */
export async function mget(keys) {
  if (!redis) return null;

  try {
    const values = await redis.mget(...keys);
    return values.map(v => v ? JSON.parse(v) : null);
  } catch (error) {
    logger.error('Cache mget error', { error: error.message });
    return null;
  }
}

/**
 * Set multiple keys
 */
export async function mset(keyValuePairs, ttlSeconds = 3600) {
  if (!redis) return false;

  try {
    const pipeline = redis.pipeline();
    
    for (const [key, value] of Object.entries(keyValuePairs)) {
      pipeline.setex(key, ttlSeconds, JSON.stringify(value));
    }

    await pipeline.exec();
    logger.debug('Cache mset', { count: Object.keys(keyValuePairs).length });
    return true;
  } catch (error) {
    logger.error('Cache mset error', { error: error.message });
    return false;
  }
}

/**
 * Close Redis connection
 */
export async function closeCache() {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis connection closed');
  }
}

export default {
  initializeCache,
  get,
  set,
  del,
  flush,
  increment,
  decrement,
  exists,
  ttl,
  expire,
  mget,
  mset,
  closeCache,
};

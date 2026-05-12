import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import env from './env.js';
import logger from './logger.js';

let db = null;
let pool = null;

/**
 * Initialize database connection
 * Supports both SQLite (development) and PostgreSQL (production)
 */
export async function initializeDatabase() {
  if (db) {
    logger.info('Database already initialized');
    return db;
  }

  try {
    const isDevelopment = env.NODE_ENV !== 'production';
    const isSupabase = env.DATABASE_URL?.includes('supabase');

    if (isSupabase || !isDevelopment) {
      // PostgreSQL / Supabase
      logger.info('Initializing PostgreSQL connection...');
      
      pool = new Pool({
        connectionString: env.DATABASE_URL,
        max: env.DATABASE_POOL_MAX,
        min: env.DATABASE_POOL_MIN,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      logger.info('✅ PostgreSQL connection successful');
      
      // Initialize Drizzle ORM
      db = drizzle(pool);
    } else {
      // SQLite (development only)
      logger.info('Initializing SQLite connection...');
      
      const sqlite3 = (await import('sqlite3')).default;
      const { open } = await import('sqlite');
      
      const sqliteDb = await open({
        filename: env.DATABASE_URL.replace('sqlite:', ''),
        driver: sqlite3.Database
      });

      await sqliteDb.exec('PRAGMA foreign_keys = ON');
      logger.info('✅ SQLite connection successful');
      
      // For SQLite, we'll use the raw connection for now
      // Drizzle ORM support for SQLite will be added in next iteration
      db = sqliteDb;
    }

    return db;
  } catch (error) {
    logger.error('Database initialization failed', { error: error.message });
    throw error;
  }
}

/**
 * Get database instance
 */
export async function getDatabase() {
  if (!db) {
    await initializeDatabase();
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  try {
    if (pool) {
      await pool.end();
      logger.info('Database pool closed');
    }
    db = null;
    pool = null;
  } catch (error) {
    logger.error('Error closing database', { error: error.message });
  }
}

/**
 * Health check for database
 */
export async function healthCheck() {
  try {
    const database = await getDatabase();
    
    if (pool) {
      // PostgreSQL
      const client = await pool.connect();
      await client.query('SELECT NOW()');
      client.release();
    } else if (database.exec) {
      // SQLite
      await database.exec('SELECT 1');
    }
    
    return { status: 'healthy', database: 'connected' };
  } catch (error) {
    logger.error('Database health check failed', { error: error.message });
    return { status: 'unhealthy', database: 'disconnected', error: error.message };
  }
}

/**
 * Execute raw query (for migrations and complex queries)
 */
export async function executeQuery(query, params = []) {
  const database = await getDatabase();
  
  try {
    if (pool) {
      // PostgreSQL
      const result = await pool.query(query, params);
      return result.rows;
    } else {
      // SQLite
      return await database.all(query, params);
    }
  } catch (error) {
    logger.error('Query execution failed', { query, error: error.message });
    throw error;
  }
}

/**
 * Begin transaction
 */
export async function beginTransaction() {
  const database = await getDatabase();
  
  if (pool) {
    const client = await pool.connect();
    await client.query('BEGIN');
    return client;
  } else {
    await database.exec('BEGIN TRANSACTION');
    return database;
  }
}

/**
 * Commit transaction
 */
export async function commitTransaction(client) {
  if (pool) {
    await client.query('COMMIT');
    client.release();
  } else {
    await client.exec('COMMIT');
  }
}

/**
 * Rollback transaction
 */
export async function rollbackTransaction(client) {
  if (pool) {
    await client.query('ROLLBACK');
    client.release();
  } else {
    await client.exec('ROLLBACK');
  }
}

export default {
  initializeDatabase,
  getDatabase,
  closeDatabase,
  healthCheck,
  executeQuery,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
};

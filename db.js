// db.js — PostgreSQL only (Vercel + Railway)
let pool = null;
let db = null;

export async function initializeDatabase() {
  if (db) return db;
  db = await initPostgres();
  console.log('✅ Database initialized');
  return db;
}

export async function getDatabase() {
  if (!db) await initializeDatabase();
  return db;
}

export async function closeDatabase() {
  if (pool) { await pool.end(); pool = null; }
  db = null;
}

async function initPostgres() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada. Adicione PostgreSQL no Railway/Vercel.');
  }

  console.log('🐘 Using PostgreSQL (persistent data)');
  const pg = await import('pg');
  const Pool = pg.default?.Pool || pg.Pool;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  const client = await pool.connect();
  console.log('✅ PostgreSQL connected');
  client.release();

  await createTables();
  return buildWrapper();
}

async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
      mrr REAL DEFAULT 0, engagement_score REAL DEFAULT 50,
      last_login TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS email_connections (
      id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE,
      provider TEXT DEFAULT 'gmail', email_address TEXT,
      access_token TEXT, refresh_token TEXT, token_expiry TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS churn_predictions (
      id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL,
      risk_score REAL, risk_level TEXT, predicted_churn_date TIMESTAMPTZ,
      actions_taken TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS upsell_opportunities (
      id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL,
      opportunity_type TEXT, estimated_value REAL, confidence_score REAL,
      best_offer_time TIMESTAMPTZ, status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS financial_snapshots (
      id SERIAL PRIMARY KEY, mrr REAL, arr REAL, runway_months REAL,
      burn_rate REAL, growth_rate REAL, churn_rate REAL, cash_balance REAL,
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS contracts (
      id SERIAL PRIMARY KEY, vendor_name TEXT NOT NULL,
      annual_cost REAL, market_rate REAL, deviation_percent REAL,
      renewal_date TEXT, status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS approvals (
      id SERIAL PRIMARY KEY, agent_type TEXT, action_type TEXT,
      customer_id INTEGER, contract_id INTEGER, decision_data TEXT,
      confidence_score REAL, status TEXT DEFAULT 'pending',
      approved_by TEXT, rejected_reason TEXT, details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ)`,
    `CREATE TABLE IF NOT EXISTS activity_logs (
      id SERIAL PRIMARY KEY, agent_type TEXT, action_type TEXT,
      customer_id INTEGER, contract_id INTEGER,
      result TEXT, status TEXT, details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS agent_executions (
      id SERIAL PRIMARY KEY, agent_type TEXT, execution_status TEXT,
      decisions_made INTEGER DEFAULT 0, approvals_required INTEGER DEFAULT 0,
      actions_executed INTEGER DEFAULT 0, errors TEXT,
      started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, name TEXT, role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1, last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY, user_id INTEGER, action TEXT,
      resource_type TEXT, resource_id INTEGER,
      old_value TEXT, new_value TEXT, ip_address TEXT, user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `ALTER TABLE approvals ADD COLUMN IF NOT EXISTS details TEXT`,
    `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deviation_percent REAL`
  ];

  for (const sql of tables) {
    await pool.query(sql);
  }
  console.log('✅ Tables ready');
}

function buildWrapper() {
  function toSQL(sql, params) {
    let i = 0;
    const pgSql = sql
      .replace(/\?/g, () => '$' + (++i))
      .replace(/datetime\('now'\)/gi, 'NOW()')
      .replace(/datetime\('now',\s*'\+(\d+)\s+(\w+)'\)/gi, "NOW() + INTERVAL '$1 $2'")
      .replace(/CURRENT_TIMESTAMP/gi, 'NOW()')
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    const pgParams = (params || []).map(p => p === undefined ? null : p);
    return { pgSql, pgParams };
  }

  return {
    get: async (sql, params) => {
      const { pgSql, pgParams } = toSQL(sql, params);
      const r = await pool.query(pgSql, pgParams);
      return r.rows[0] || null;
    },
    all: async (sql, params) => {
      const { pgSql, pgParams } = toSQL(sql, params);
      const r = await pool.query(pgSql, pgParams);
      return r.rows;
    },
    run: async (sql, params) => {
      const { pgSql, pgParams } = toSQL(sql, params);
      try {
        const r = await pool.query(pgSql + ' RETURNING id', pgParams);
        return { lastID: r.rows[0]?.id || null, changes: r.rowCount || 0 };
      } catch {
        const r = await pool.query(pgSql, pgParams);
        return { lastID: null, changes: r.rowCount || 0 };
      }
    },
    exec: async (sql) => { await pool.query(sql); }
  };
}

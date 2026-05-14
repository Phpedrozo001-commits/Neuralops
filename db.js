// db.js — Auto-detecta PostgreSQL ou SQLite
// Se DATABASE_URL estiver configurado → usa PostgreSQL (dados persistentes)
// Se não → usa SQLite (dados temporários, apenas para desenvolvimento)

const USE_POSTGRES = !!process.env.DATABASE_URL;

let db = null;
let pgPool = null;

// ── SQLITE ───────────────────────────────────────────────────────────────────
async function initSQLite() {
  const sqlite3 = (await import('sqlite3')).default;
  const { open } = await import('sqlite');
  const path = (await import('path')).default;
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const conn = await open({
    filename: path.join(__dirname, 'neuralops.db'),
    driver: sqlite3.Database
  });

  await conn.exec('PRAGMA foreign_keys = OFF');
  await createTablesSQLite(conn);
  console.log('✅ SQLite initialized (dados temporários)');
  console.log('   💡 Adicione PostgreSQL no Railway para dados persistentes');
  return conn;
}

async function createTablesSQLite(conn) {
  await conn.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      mrr REAL DEFAULT 0,
      engagement_score REAL DEFAULT 50,
      last_login TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS churn_predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      risk_score REAL,
      risk_level TEXT,
      predicted_churn_date TEXT,
      actions_taken TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS upsell_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      opportunity_type TEXT,
      estimated_value REAL,
      confidence_score REAL,
      best_offer_time TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS financial_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mrr REAL, arr REAL, runway_months REAL,
      burn_rate REAL, growth_rate REAL,
      churn_rate REAL, cash_balance REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      annual_cost REAL, market_rate REAL,
      deviation_percent REAL, renewal_date TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT, action_type TEXT,
      customer_id INTEGER, contract_id INTEGER,
      decision_data TEXT, confidence_score REAL,
      status TEXT DEFAULT 'pending',
      approved_by TEXT, rejected_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT, action_type TEXT,
      customer_id INTEGER, contract_id INTEGER,
      result TEXT, status TEXT, details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agent_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT, execution_status TEXT,
      decisions_made INTEGER DEFAULT 0,
      approvals_required INTEGER DEFAULT 0,
      actions_executed INTEGER DEFAULT 0,
      errors TEXT, started_at DATETIME, completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT, role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action TEXT,
      resource_type TEXT, resource_id INTEGER,
      old_value TEXT, new_value TEXT,
      ip_address TEXT, user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  `);
}

// ── POSTGRESQL ────────────────────────────────────────────────────────────────
async function initPostgres() {
  const { default: pkg } = await import('pg');
  const { Pool } = pkg;

  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  const client = await pgPool.connect();
  console.log('✅ PostgreSQL conectado (dados persistentes)');
  client.release();

  await createTablesPostgres();
  return buildPgWrapper();
}

async function createTablesPostgres() {
  const client = await pgPool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE,
        mrr REAL DEFAULT 0, engagement_score REAL DEFAULT 50,
        last_login TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS churn_predictions (
        id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL,
        risk_score REAL, risk_level TEXT, predicted_churn_date TIMESTAMPTZ,
        actions_taken TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS upsell_opportunities (
        id SERIAL PRIMARY KEY, customer_id INTEGER NOT NULL,
        opportunity_type TEXT, estimated_value REAL, confidence_score REAL,
        best_offer_time TIMESTAMPTZ, status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS financial_snapshots (
        id SERIAL PRIMARY KEY, mrr REAL, arr REAL, runway_months REAL,
        burn_rate REAL, growth_rate REAL, churn_rate REAL, cash_balance REAL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY, vendor_name TEXT NOT NULL,
        annual_cost REAL, market_rate REAL, deviation_percent REAL,
        renewal_date TEXT, status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY, agent_type TEXT, action_type TEXT,
        customer_id INTEGER, contract_id INTEGER, decision_data TEXT,
        confidence_score REAL, status TEXT DEFAULT 'pending',
        approved_by TEXT, rejected_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY, agent_type TEXT, action_type TEXT,
        customer_id INTEGER, contract_id INTEGER,
        result TEXT, status TEXT, details TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS agent_executions (
        id SERIAL PRIMARY KEY, agent_type TEXT, execution_status TEXT,
        decisions_made INTEGER DEFAULT 0, approvals_required INTEGER DEFAULT 0,
        actions_executed INTEGER DEFAULT 0, errors TEXT,
        started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL, name TEXT, role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1, last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY, user_id INTEGER, action TEXT,
        resource_type TEXT, resource_id INTEGER,
        old_value TEXT, new_value TEXT,
        ip_address TEXT, user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  } finally {
    client.release();
  }
}

function buildPgWrapper() {
  let paramCounter = 0;

  function toPostgresSQL(sql) {
    paramCounter = 0;
    return sql
      .replace(/\?/g, () => `$${++paramCounter}`)
      .replace(/datetime\('now'\)/gi, 'NOW()')
      .replace(/datetime\('now',\s*'([^']+)'\)/gi, (_, interval) => {
        const cleaned = interval.replace(/^\+/, '').trim();
        return `NOW() + INTERVAL '${cleaned}'`;
      })
      .replace(/CURRENT_TIMESTAMP/gi, 'NOW()')
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  }

  return {
    get: async (sql, params = []) => {
      const r = await pgPool.query(toPostgresSQL(sql), params.map(p => p ?? null));
      return r.rows[0] || null;
    },
    all: async (sql, params = []) => {
      const r = await pgPool.query(toPostgresSQL(sql), params.map(p => p ?? null));
      return r.rows;
    },
    run: async (sql, params = []) => {
      const pgSql = toPostgresSQL(sql);
      const pgParams = params.map(p => p ?? null);
      try {
        const r = await pgPool.query(pgSql + ' RETURNING id', pgParams);
        return { lastID: r.rows[0]?.id || null, changes: r.rowCount || 0 };
      } catch {
        const r = await pgPool.query(pgSql, pgParams);
        return { lastID: null, changes: r.rowCount || 0 };
      }
    },
    exec: async (sql) => { await pgPool.query(sql); }
  };
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
export async function initializeDatabase() {
  if (db) return db;

  if (USE_POSTGRES) {
    db = await initPostgres();
  } else {
    db = await initSQLite();
  }

  console.log('✅ Database initialized successfully');
  return db;
}

export async function getDatabase() {
  if (!db) await initializeDatabase();
  return db;
}

export async function closeDatabase() {
  if (pgPool) { await pgPool.end(); pgPool = null; }
  db = null;
}
.

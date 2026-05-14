// db.js — PostgreSQL (dados persistentes no Railway)
import pkg from 'pg';
const { Pool } = pkg;

let pool = null;

export async function initializeDatabase() {
  if (pool) return pool;

  // Railway injeta DATABASE_URL automaticamente quando você adiciona PostgreSQL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não configurada! Adicione um banco PostgreSQL no Railway.');
    process.exit(1);
  }

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Testa conexão
  const client = await pool.connect();
  console.log('✅ PostgreSQL conectado');
  client.release();

  // Cria tabelas
  await createTables();

  console.log('✅ Database initialized successfully');
  return pool;
}

async function createTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        mrr REAL DEFAULT 0,
        engagement_score REAL DEFAULT 50,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS churn_predictions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        risk_score REAL,
        risk_level TEXT,
        predicted_churn_date TIMESTAMPTZ,
        actions_taken TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS upsell_opportunities (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        opportunity_type TEXT,
        estimated_value REAL,
        confidence_score REAL,
        best_offer_time TIMESTAMPTZ,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS financial_snapshots (
        id SERIAL PRIMARY KEY,
        mrr REAL,
        arr REAL,
        runway_months REAL,
        burn_rate REAL,
        growth_rate REAL,
        churn_rate REAL,
        cash_balance REAL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS contracts (
        id SERIAL PRIMARY KEY,
        vendor_name TEXT NOT NULL,
        annual_cost REAL,
        market_rate REAL,
        deviation_percent REAL,
        renewal_date TEXT,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        agent_type TEXT,
        action_type TEXT,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
        decision_data TEXT,
        confidence_score REAL,
        status TEXT DEFAULT 'pending',
        approved_by TEXT,
        rejected_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        agent_type TEXT,
        action_type TEXT,
        customer_id INTEGER,
        contract_id INTEGER,
        result TEXT,
        status TEXT,
        details TEXT,
        description TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS agent_executions (
        id SERIAL PRIMARY KEY,
        agent_type TEXT,
        execution_status TEXT,
        decisions_made INTEGER DEFAULT 0,
        approvals_required INTEGER DEFAULT 0,
        actions_executed INTEGER DEFAULT 0,
        errors TEXT,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'user',
        is_active INTEGER DEFAULT 1,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action TEXT,
        resource_type TEXT,
        resource_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
      CREATE INDEX IF NOT EXISTS idx_churn_customer ON churn_predictions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_upsell_customer ON upsell_opportunities(customer_id);
      CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
      CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_logs(agent_type);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  } finally {
    client.release();
  }
}

// ── Wrapper compatível com a API do sqlite (get, all, run) ──────────────────

export async function getDatabase() {
  if (!pool) await initializeDatabase();

  return {
    // Retorna uma única linha
    get: async (sql, params = []) => {
      const pgSql = convertSql(sql);
      const pgParams = convertParams(params);
      const result = await pool.query(pgSql, pgParams);
      return result.rows[0] || null;
    },

    // Retorna todas as linhas
    all: async (sql, params = []) => {
      const pgSql = convertSql(sql);
      const pgParams = convertParams(params);
      const result = await pool.query(pgSql, pgParams);
      return result.rows;
    },

    // INSERT/UPDATE/DELETE
    run: async (sql, params = []) => {
      const pgSql = convertSql(sql);
      const pgParams = convertParams(params);
      const result = await pool.query(pgSql + ' RETURNING id', pgParams).catch(async () => {
        // Se RETURNING falhar (UPDATE/DELETE), tenta sem
        return pool.query(pgSql, pgParams);
      });
      return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount || 0
      };
    },

    // Executa SQL direto (CREATE TABLE etc)
    exec: async (sql) => {
      await pool.query(sql);
    }
  };
}

// Converte SQLite syntax para PostgreSQL
function convertSql(sql) {
  return sql
    // Parâmetros ? → $1, $2, etc
    .replace(/\?/g, () => {
      convertSql._counter = (convertSql._counter || 0) + 1;
      return `$${convertSql._counter}`;
    })
    // Funções de data SQLite → PostgreSQL
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/datetime\('now',\s*'([^']+)'\)/gi, (_, interval) => {
      const pg = interval
        .replace('+', '')
        .replace('days', 'days')
        .replace('hours', 'hours')
        .replace('minutes', 'minutes')
        .trim();
      return `NOW() + INTERVAL '${pg}'`;
    })
    .replace(/CURRENT_TIMESTAMP/gi, "NOW()")
    // AUTOINCREMENT → SERIAL (já tratado na criação das tabelas)
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
    // IF NOT EXISTS para índices
    .replace(/CREATE INDEX IF NOT EXISTS/gi, 'CREATE INDEX IF NOT EXISTS');
}

function convertParams(params) {
  convertSql._counter = 0;
  return params.map(p => p === undefined ? null : p);
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

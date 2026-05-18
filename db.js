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
    `CREATE TABLE IF NOT EXISTS user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      company_name TEXT,
      company_segment TEXT,
      job_title TEXT,
      phone TEXT,
      avatar_color TEXT DEFAULT '#00d4ff',
      avatar_letter TEXT,
      theme TEXT DEFAULT 'dark',
      language TEXT DEFAULT 'pt-BR',
      currency TEXT DEFAULT 'BRL',
      timezone TEXT DEFAULT 'America/Sao_Paulo',
      mrr_goal REAL DEFAULT 0,
      growth_goal REAL DEFAULT 0,
      notify_churn BOOLEAN DEFAULT true,
      notify_upsell BOOLEAN DEFAULT true,
      notify_approval_expire BOOLEAN DEFAULT true,
      notify_slack BOOLEAN DEFAULT false,
      notify_email BOOLEAN DEFAULT true,
      report_frequency TEXT DEFAULT 'weekly',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS login_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status)`,
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `ALTER TABLE approvals ADD COLUMN IF NOT EXISTS details TEXT`,
    `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deviation_percent REAL`,

    // ── SEGMENTOS & ONBOARDING ──────────────────────────
    `CREATE TABLE IF NOT EXISTS business_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      segment TEXT DEFAULT 'saas',
      plan TEXT DEFAULT 'starter',
      onboarding_completed BOOLEAN DEFAULT false,
      onboarding_step INTEGER DEFAULT 0,
      company_size TEXT DEFAULT 'micro',
      monthly_revenue REAL DEFAULT 0,
      customer_count INTEGER DEFAULT 0,
      main_challenge TEXT,
      white_label_name TEXT,
      white_label_color TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── PIPELINE DE VENDAS ──────────────────────────────
    `CREATE TABLE IF NOT EXISTS sales_pipeline (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      lead_name TEXT NOT NULL,
      lead_email TEXT,
      lead_phone TEXT,
      company TEXT,
      deal_value REAL DEFAULT 0,
      stage TEXT DEFAULT 'prospect',
      probability INTEGER DEFAULT 30,
      notes TEXT,
      last_contact TIMESTAMPTZ,
      expected_close TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sales_user ON sales_pipeline(user_id)`,

    // ── INADIMPLÊNCIA ────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS delinquency_records (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      due_date TIMESTAMPTZ,
      days_overdue INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      last_contact TIMESTAMPTZ,
      contact_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_delinquency_user ON delinquency_records(user_id)`,

    // ── TEMPLATES DE EMAIL ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      segment TEXT DEFAULT 'all',
      category TEXT DEFAULT 'retention',
      subject TEXT,
      body TEXT,
      tone TEXT DEFAULT 'professional',
      is_default BOOLEAN DEFAULT false,
      usage_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_templates_user ON email_templates(user_id)`,

    // ── HISTÓRICO DE DECISÕES ────────────────────────────
    `CREATE TABLE IF NOT EXISTS decision_outcomes (
      id SERIAL PRIMARY KEY,
      approval_id INTEGER,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      agent_type TEXT,
      action_taken TEXT,
      customer_name TEXT,
      customer_email TEXT,
      outcome TEXT DEFAULT 'pending',
      revenue_impact REAL DEFAULT 0,
      email_sent BOOLEAN DEFAULT false,
      notes TEXT,
      decided_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_outcomes_user ON decision_outcomes(user_id)`,

    // ── RELATÓRIOS ───────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS report_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      report_type TEXT DEFAULT 'weekly',
      period_start TIMESTAMPTZ,
      period_end TIMESTAMPTZ,
      total_decisions INTEGER DEFAULT 0,
      emails_sent INTEGER DEFAULT 0,
      revenue_impact REAL DEFAULT 0,
      customers_retained INTEGER DEFAULT 0,
      summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── METAS VISUAIS ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS business_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      goal_type TEXT NOT NULL,
      target_value REAL NOT NULL,
      current_value REAL DEFAULT 0,
      period TEXT DEFAULT 'monthly',
      deadline TIMESTAMPTZ,
      achieved BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── PLANOS ────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS usage_stats (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      customers_count INTEGER DEFAULT 0,
      emails_sent_month INTEGER DEFAULT 0,
      agents_runs_month INTEGER DEFAULT 0,
      api_calls_month INTEGER DEFAULT 0,
      period_reset TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── HISTÓRICO DE EMAILS ──────────────────────────────
    `CREATE TABLE IF NOT EXISTS email_history (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      approval_id INTEGER,
      customer_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      subject TEXT,
      body TEXT,
      agent_type TEXT,
      action_type TEXT,
      channel TEXT DEFAULT 'email',
      status TEXT DEFAULT 'sent',
      sent_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_email_history_user ON email_history(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_email_history_sent ON email_history(sent_at)`,

    // ── CAMPO WHATSAPP NOS CLIENTES ──────────────────────
    `ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp TEXT`,

    // ── MULTI-EMPRESA ─────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS companies (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      segment TEXT DEFAULT 'saas',
      is_active BOOLEAN DEFAULT true,
      mrr REAL DEFAULT 0,
      customer_count INTEGER DEFAULT 0,
      health_score INTEGER DEFAULT 0,
      color TEXT DEFAULT '#00d4ff',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_companies_owner ON companies(owner_user_id)`,

    // ── AUTOMAÇÕES / RÉGUA DE RELACIONAMENTO ─────────────
    `CREATE TABLE IF NOT EXISTS automation_rules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_value REAL,
      trigger_days INTEGER,
      action_type TEXT NOT NULL,
      template_id INTEGER,
      channel TEXT DEFAULT 'email',
      delay_hours INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT true,
      runs_count INTEGER DEFAULT 0,
      last_run TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_automations_user ON automation_rules(user_id)`,

    // ── MARKETPLACE DE AUTOMAÇÕES ─────────────────────────
    `CREATE TABLE IF NOT EXISTS automation_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'retention',
      segment TEXT DEFAULT 'all',
      trigger_type TEXT,
      trigger_value REAL,
      action_type TEXT,
      email_subject TEXT,
      email_body TEXT,
      installs INTEGER DEFAULT 0,
      rating REAL DEFAULT 5.0,
      is_featured BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── HEALTH SCORE HISTÓRICO ─────────────────────────────
    `CREATE TABLE IF NOT EXISTS health_scores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      score INTEGER NOT NULL,
      churn_score INTEGER DEFAULT 0,
      revenue_score INTEGER DEFAULT 0,
      engagement_score INTEGER DEFAULT 0,
      pipeline_score INTEGER DEFAULT 0,
      goals_score INTEGER DEFAULT 0,
      details JSONB,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_health_user ON health_scores(user_id)`,

    // ── SESSÕES DE COACHING ───────────────────────────────
    `CREATE TABLE IF NOT EXISTS coach_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      questions JSONB,
      answers JSONB,
      action_plan TEXT,
      ai_summary TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // ── ROI TRACKING ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS roi_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      amount REAL DEFAULT 0,
      description TEXT,
      agent_type TEXT,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS idx_roi_user ON roi_events(user_id)`,

    // ── WHITE LABEL CONFIG ────────────────────────────────
    `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS wl_logo TEXT`,
    `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS wl_primary_color TEXT`,
    `ALTER TABLE business_profiles ADD COLUMN IF NOT EXISTS wl_company_name TEXT`
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

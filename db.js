import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'neuralops.db');

let db = null;

export async function initializeDatabase() {
  if (db) return db;

  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON');

  // Create tables
  await db.exec(`
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS upsell_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      opportunity_type TEXT,
      estimated_value REAL,
      confidence_score REAL,
      best_offer_time TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS financial_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mrr REAL,
      arr REAL,
      runway_months REAL,
      burn_rate REAL,
      growth_rate REAL,
      churn_rate REAL,
      cash_balance REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_name TEXT NOT NULL,
      annual_cost REAL,
      market_rate REAL,
      deviation_percent REAL,
      renewal_date TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT,
      action_type TEXT,
      customer_id INTEGER,
      contract_id INTEGER,
      decision_data TEXT,
      confidence_score REAL,
      status TEXT DEFAULT 'pending',
      approved_by TEXT,
      rejected_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT,
      action_type TEXT,
      customer_id INTEGER,
      contract_id INTEGER,
      result TEXT,
      status TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE IF NOT EXISTS agent_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT,
      execution_status TEXT,
      decisions_made INTEGER DEFAULT 0,
      approvals_required INTEGER DEFAULT 0,
      actions_executed INTEGER DEFAULT 0,
      errors TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT DEFAULT 'user',
      is_active INTEGER DEFAULT 1,
      last_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      resource_type TEXT,
      resource_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_churn_predictions_customer ON churn_predictions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_upsell_opportunities_customer ON upsell_opportunities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_agent ON activity_logs(agent_type);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
  `);

  console.log('✅ Database initialized successfully');
  return db;
}

export async function getDatabase() {
  if (!db) {
    await initializeDatabase();
  }
  return db;
}

export async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
  }
}

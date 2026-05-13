-- ============================================
-- NeuralOps Database Schema (FIXED)
-- PostgreSQL / Supabase
-- ============================================

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name TEXT,
  role VARCHAR(50) DEFAULT 'user' NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- PLANS TABLE (SaaS) - CRIADA ANTES DE SUBSCRIPTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  stripe_price_id VARCHAR(255),
  price_monthly DECIMAL(12, 2),
  price_annual DECIMAL(12, 2),
  description TEXT,
  features JSONB,
  limits JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plans_name ON plans(name);
CREATE INDEX idx_plans_is_active ON plans(is_active);

-- ============================================
-- CUSTOMERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email VARCHAR(320) UNIQUE,
  mrr DECIMAL(12, 2) DEFAULT 0,
  engagement_score DECIMAL(5, 2) DEFAULT 50,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customers_user_id ON customers(user_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_mrr ON customers(mrr);

-- ============================================
-- CHURN PREDICTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS churn_predictions (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  risk_score DECIMAL(5, 2),
  risk_level VARCHAR(50),
  predicted_churn_date TIMESTAMP,
  actions_taken TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_churn_predictions_customer_id ON churn_predictions(customer_id);
CREATE INDEX idx_churn_predictions_risk_level ON churn_predictions(risk_level);
CREATE INDEX idx_churn_predictions_created_at ON churn_predictions(created_at);

-- ============================================
-- UPSELL OPPORTUNITIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS upsell_opportunities (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  opportunity_type VARCHAR(100),
  estimated_value DECIMAL(12, 2),
  confidence_score DECIMAL(5, 2),
  best_offer_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_upsell_opportunities_customer_id ON upsell_opportunities(customer_id);
CREATE INDEX idx_upsell_opportunities_status ON upsell_opportunities(status);
CREATE INDEX idx_upsell_opportunities_created_at ON upsell_opportunities(created_at);

-- ============================================
-- FINANCIAL SNAPSHOTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mrr DECIMAL(12, 2),
  arr DECIMAL(12, 2),
  runway_months DECIMAL(10, 2),
  burn_rate DECIMAL(12, 2),
  growth_rate DECIMAL(5, 2),
  churn_rate DECIMAL(5, 2),
  cash_balance DECIMAL(12, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_financial_snapshots_user_id ON financial_snapshots(user_id);
CREATE INDEX idx_financial_snapshots_created_at ON financial_snapshots(created_at);

-- ============================================
-- CONTRACTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  annual_cost DECIMAL(12, 2),
  market_rate DECIMAL(12, 2),
  deviation_percent DECIMAL(5, 2),
  renewal_date TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_contracts_user_id ON contracts(user_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_created_at ON contracts(created_at);

-- ============================================
-- APPROVALS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(100),
  action_type VARCHAR(100),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  decision_data JSONB,
  confidence_score DECIMAL(5, 2),
  status VARCHAR(50) DEFAULT 'pending',
  approved_by VARCHAR(320),
  rejected_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE INDEX idx_approvals_user_id ON approvals(user_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_expires_at ON approvals(expires_at);
CREATE INDEX idx_approvals_created_at ON approvals(created_at);

-- ============================================
-- ACTIVITY LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(100),
  action_type VARCHAR(100),
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  result TEXT,
  status VARCHAR(50),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_agent_type ON activity_logs(agent_type);
CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at);

-- ============================================
-- AGENT EXECUTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS agent_executions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  agent_type VARCHAR(100),
  execution_status VARCHAR(50),
  decisions_made INTEGER DEFAULT 0,
  approvals_required INTEGER DEFAULT 0,
  actions_executed INTEGER DEFAULT 0,
  errors TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_agent_executions_user_id ON agent_executions(user_id);
CREATE INDEX idx_agent_executions_agent_type ON agent_executions(agent_type);
CREATE INDEX idx_agent_executions_created_at ON agent_executions(created_at);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(100),
  resource_type VARCHAR(100),
  resource_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- ============================================
-- SUBSCRIPTIONS TABLE (SaaS) - AGORA PLANS EXISTE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES plans(id),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) DEFAULT 'active',
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at TIMESTAMP,
  canceled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- ============================================
-- USAGE LOGS TABLE (SaaS)
-- ============================================
CREATE TABLE IF NOT EXISTS usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  metric_name VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_metric_name ON usage_logs(metric_name);
CREATE INDEX idx_usage_logs_period ON usage_logs(period_start, period_end);

-- ============================================
-- CONVERSATIONS TABLE (Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at);

-- ============================================
-- MESSAGES TABLE (Chat)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(50),
  content TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- ============================================
-- BILLING HISTORY TABLE (SaaS)
-- ============================================
CREATE TABLE IF NOT EXISTS billing_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INTEGER REFERENCES subscriptions(id) ON DELETE CASCADE,
  stripe_invoice_id VARCHAR(255),
  amount DECIMAL(12, 2),
  currency VARCHAR(3),
  status VARCHAR(50),
  invoice_url TEXT,
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_billing_history_user_id ON billing_history(user_id);
CREATE INDEX idx_billing_history_subscription_id ON billing_history(subscription_id);
CREATE INDEX idx_billing_history_stripe_invoice_id ON billing_history(stripe_invoice_id);

-- ============================================
-- UPDATE UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- INITIAL PLANS
-- ============================================
INSERT INTO plans (name, price_monthly, price_annual, description, features, limits, is_active)
VALUES
  (
    'Free',
    0,
    0,
    'Perfect for getting started',
    '["Basic agent access", "Limited API calls", "Community support"]'::jsonb,
    '{"api_calls_per_month": 1000, "conversations_per_month": 10, "agents": 1}'::jsonb,
    true
  ),
  (
    'Pro',
    99,
    990,
    'For growing businesses',
    '["All Free features", "Advanced analytics", "Priority support", "Custom agents"]'::jsonb,
    '{"api_calls_per_month": 100000, "conversations_per_month": 1000, "agents": 5}'::jsonb,
    true
  ),
  (
    'Enterprise',
    999,
    9990,
    'For large organizations',
    '["All Pro features", "Dedicated support", "Custom integrations", "SLA guarantee"]'::jsonb,
    '{"api_calls_per_month": 1000000, "conversations_per_month": 100000, "agents": "unlimited"}'::jsonb,
    true
  )
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- SCHEMA VERSION
-- ============================================
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_version (version, description)
VALUES (1, 'Initial schema with users, customers, agents, and SaaS tables')
ON CONFLICT DO NOTHING;

import express from 'express';
// NeuralOps Backend - Node.js 24.x Required
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import scheduler from './scheduler.js';
import approvalEngine from './approval.js';
import { authMiddleware, requireRole, loginUser, registerUser, generateToken } from './middleware/auth.js';
import { 
  securityHeaders, 
  corsConfig, 
  errorHandler, 
  requestLogger,
  generalLimiter,
  authLimiter,
  approvalLimiter,
  agentLimiter
} from './middleware/security.js';
import { 
  validateRequest, 
  customerValidation, 
  contractValidation,
  approvalValidation,
  loginValidation,
  registerValidation,
  chatValidation
} from './middleware/validation.js';
import { logAudit, getAuditLogs } from './utils/audit.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// SECURITY MIDDLEWARE
// ============================================
app.use(securityHeaders);
app.use(corsConfig);
app.use(requestLogger);
app.use(express.json({ limit: '10kb' }));
app.use(generalLimiter);

// Initialize database on startup
let db;
(async () => {
  db = await initializeDatabase();
  await scheduler.start();
})();

// ============================================
// AUTHENTICATION ROUTES
// ============================================
app.post('/api/auth/register', authLimiter, registerValidation, validateRequest, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await registerUser(email, password, name);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', authLimiter, loginValidation, validateRequest, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    if (!result.success) {
      return res.status(401).json({ error: result.error });
    }
    await logAudit(result.user.id, 'LOGIN', 'user', result.user.id, null, null, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/refresh', authMiddleware, async (req, res) => {
  try {
    const token = await generateToken(req.user.userId, req.user.role);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATIC FILES & PAGES
// ============================================
app.use(express.static('publico'));

app.get('/', (req, res) => {
  res.sendFile(new URL('./publico/index.html', import.meta.url).pathname);
});

app.get('/login', (req, res) => {
  res.sendFile(new URL('./publico/auth.html', import.meta.url).pathname);
});

app.get('/register', (req, res) => {
  res.sendFile(new URL('./publico/auth.html', import.meta.url).pathname);
});

app.get('/dashboard', (req, res) => {
  res.sendFile(new URL('./publico/dashboard.html', import.meta.url).pathname);
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    scheduler: scheduler.getStatus()
  });
});

// ============================================
// PROTECTED ROUTES - Dashboard
// ============================================
app.get('/api/dashboard/overview', authMiddleware, async (req, res) => {
  try {
    const latestSnapshot = await db.get(`
      SELECT * FROM financial_snapshots 
      ORDER BY created_at DESC LIMIT 1
    `);
    const pendingApprovals = await db.get(`
      SELECT COUNT(*) as count FROM approvals 
      WHERE status = 'pending' AND expires_at > datetime('now')
    `);
    const recentChurn = await db.get(`
      SELECT COUNT(*) as count FROM churn_predictions 
      WHERE risk_level IN ('high', 'critical')
      AND created_at > datetime('now', '-7 days')
    `);
    const recentUpsell = await db.get(`
      SELECT COUNT(*) as count FROM upsell_opportunities 
      WHERE status = 'pending'
      AND created_at > datetime('now', '-7 days')
    `);
    await logAudit(req.user.userId, 'VIEW', 'dashboard', null, null, null, req);
    res.json({
      financial_snapshot: latestSnapshot,
      pending_approvals: pendingApprovals?.count || 0,
      high_risk_customers: recentChurn?.count || 0,
      upsell_opportunities: recentUpsell?.count || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHURN PREDICTIONS
// ============================================
app.get('/api/churn/risks', authMiddleware, async (req, res) => {
  try {
    const risks = await db.all(`
      SELECT c.id, c.name, c.email, c.mrr, cp.risk_score, cp.risk_level, cp.created_at
      FROM churn_predictions cp
      JOIN customers c ON cp.customer_id = c.id
      WHERE cp.risk_level IN ('high', 'critical')
      ORDER BY cp.risk_score DESC
      LIMIT 50
    `);
    res.json(risks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/churn/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const result = await scheduler.triggerAgent('churn_prediction');
    await logAudit(req.user.userId, 'TRIGGER_AGENT', 'churn_prediction', null, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UPSELL OPPORTUNITIES
// ============================================
app.get('/api/upsell/opportunities', authMiddleware, async (req, res) => {
  try {
    const opportunities = await db.all(`
      SELECT c.id, c.name, c.email, c.mrr, uo.opportunity_type, uo.estimated_value, uo.confidence_score, uo.status
      FROM upsell_opportunities uo
      JOIN customers c ON uo.customer_id = c.id
      WHERE uo.status = 'pending'
      ORDER BY uo.estimated_value DESC
      LIMIT 50
    `);
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upsell/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const result = await scheduler.triggerAgent('upsell_crosssell');
    await logAudit(req.user.userId, 'TRIGGER_AGENT', 'upsell_crosssell', null, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FINANCIAL DATA
// ============================================
app.get('/api/financial/snapshot', authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.get(`
      SELECT * FROM financial_snapshots 
      ORDER BY created_at DESC LIMIT 1
    `);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/financial/history', authMiddleware, async (req, res) => {
  try {
    const history = await db.all(`
      SELECT * FROM financial_snapshots 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/financial/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const result = await scheduler.triggerAgent('financial_projection');
    await logAudit(req.user.userId, 'TRIGGER_AGENT', 'financial_projection', null, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTRACT RENEGOTIATION
// ============================================
app.get('/api/contracts/overpriced', authMiddleware, async (req, res) => {
  try {
    const contracts = await db.all(`
      SELECT * FROM contracts 
      WHERE deviation_percent > 10
      AND status = 'active'
      ORDER BY deviation_percent DESC
    `);
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contracts/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const result = await scheduler.triggerAgent('contract_renegotiation');
    await logAudit(req.user.userId, 'TRIGGER_AGENT', 'contract_renegotiation', null, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// APPROVALS
// ============================================
app.get('/api/approvals/pending', authMiddleware, async (req, res) => {
  try {
    const approvals = await approvalEngine.getPendingApprovals();
    res.json(approvals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/:id/approve', authMiddleware, requireRole('admin', 'manager'), approvalLimiter, approvalValidation, validateRequest, async (req, res) => {
  try {
    const { approvedBy } = req.body;
    const result = await approvalEngine.approveDecision(req.params.id, approvedBy);
    await logAudit(req.user.userId, 'APPROVE_DECISION', 'approval', req.params.id, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/approvals/:id/reject', authMiddleware, requireRole('admin', 'manager'), approvalLimiter, approvalValidation, validateRequest, async (req, res) => {
  try {
    const { rejectedBy, reason } = req.body;
    const result = await approvalEngine.rejectDecision(req.params.id, rejectedBy, reason);
    await logAudit(req.user.userId, 'REJECT_DECISION', 'approval', req.params.id, null, { reason }, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/approvals/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await approvalEngine.getApprovalStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ACTIVITY LOG
// ============================================
app.get('/api/activity/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await db.all(`
      SELECT * FROM activity_logs 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUDIT LOGS
// ============================================
app.get('/api/audit/logs', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const filters = {
      userId: req.query.userId,
      resourceType: req.query.resourceType,
      action: req.query.action,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    const logs = await getAuditLogs(filters);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CUSTOMERS
// ============================================
app.post('/api/customers', authMiddleware, requireRole('admin', 'manager'), customerValidation, validateRequest, async (req, res) => {
  try {
    const { name, email, mrr, engagement_score } = req.body;
    const result = await db.run(
      `INSERT INTO customers (name, email, mrr, engagement_score) VALUES (?, ?, ?, ?)`,
      [name, email, mrr || 0, engagement_score || 50]
    );
    await logAudit(req.user.userId, 'CREATE', 'customer', result.lastID, null, { name, email }, req);
    res.status(201).json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const customers = await db.all(`SELECT * FROM customers LIMIT 50`);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTRACTS
// ============================================
app.post('/api/contracts', authMiddleware, requireRole('admin', 'manager'), contractValidation, validateRequest, async (req, res) => {
  try {
    const { vendor_name, annual_cost, market_rate } = req.body;
    const result = await db.run(
      `INSERT INTO contracts (vendor_name, annual_cost, market_rate) VALUES (?, ?, ?)`,
      [vendor_name, annual_cost, market_rate]
    );
    await logAudit(req.user.userId, 'CREATE', 'contract', result.lastID, null, { vendor_name, annual_cost }, req);
    res.status(201).json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contracts', authMiddleware, async (req, res) => {
  try {
    const contracts = await db.all(`SELECT * FROM contracts LIMIT 50`);
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHAT
// ============================================
app.post('/api/chat', authMiddleware, chatValidation, validateRequest, async (req, res) => {
  try {
    const { message } = req.body;
    let response = 'Posso ajudar com análise de churn, oportunidades de upsell, projeções financeiras e contratos.';
    const msg = message.toLowerCase();
    if (msg.includes('churn')) {
      response = 'Analisando riscos de churn... Detectei clientes em risco. Acesse a aba Aprovações para ver as ações recomendadas.';
    } else if (msg.includes('upsell') || msg.includes('venda')) {
      response = 'Identificando oportunidades de upsell com base no comportamento dos clientes. Veja a seção de Agentes para disparar uma análise completa.';
    } else if (msg.includes('financ') || msg.includes('mrr') || msg.includes('runway')) {
      response = 'Buscando dados financeiros... MRR, ARR e runway estão disponíveis na Visão Geral do dashboard.';
    } else if (msg.includes('contrat')) {
      response = 'Analisando contratos... O agente de renegociação pode identificar contratos acima do mercado automaticamente.';
    } else if (msg.includes('agente')) {
      response = 'Temos 4 agentes ativos: Churn Prediction, Upsell & Cross-sell, Financial Projection e Contract Renegotiation. Acesse a aba Agentes para disparar qualquer um.';
    }
    await logAudit(req.user.userId, 'CHAT_MESSAGE', 'chat', null, null, { message }, req);
    res.json({ response, type: 'chat' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use(errorHandler);

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🤖 NeuralOps Backend Started         ║
║   Port: ${PORT}                           ║
║   Database: SQLite                     ║
║   Scheduler: Active                    ║
║   Security: Enabled                    ║
║   Auth: JWT + Rate Limiting            ║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

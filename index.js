import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { initializeDatabase, getDatabase } from './db.js';
import approvalEngine from './approval.js';
import { authMiddleware, requireRole, loginUser, registerUser, generateToken } from './middleware/auth.js';
import { securityHeaders, corsConfig, errorHandler, requestLogger, generalLimiter, authLimiter, approvalLimiter, agentLimiter } from './middleware/security.js';
import { validateRequest, customerValidation, contractValidation, approvalValidation, loginValidation, registerValidation, chatValidation } from './middleware/validation.js';
import { logAudit, getAuditLogs } from './utils/audit.js';
import { getGoogleAuthUrl, exchangeCodeForTokens, getGoogleUserEmail } from './services/gmailService.js';
import { sendEmail } from './services/email.js';
import { registerSegmentRoutes } from './routes/segments.js';

// Stripe, Slack e WhatsApp — importados dinamicamente quando necessário
async function getSyncStripe() {
  try { const m = await import('./services/stripeService.js'); return m; } catch { return null; }
}
async function getSlack() {
  try { const m = await import('./services/slackService.js'); return m; } catch { return null; }
}
async function getWhatsApp() {
  try { const m = await import('./services/whatsappService.js'); return m; } catch { return null; }
}

dotenv.config();

// Captura erros não tratados para debugar no Vercel
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error('STACK:', err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

const app = express();
const PORT = process.env.PORT || 3001;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ✅ Fix Railway proxy - necessário para rate limiter funcionar corretamente
app.set('trust proxy', 1);

// ============================================
// CLAUDE AI HELPER
// ============================================
async function callClaude(systemPrompt, userMessage, maxTokens = 1024) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'ANTHROPIC_API_KEY não configurada.' };
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ Claude API error: ${response.status} - ${err}`);
      return { success: false, error: `Claude API error: ${response.status}` };
    }
    const data = await response.json();
    return { success: true, text: data.content[0].text };
  } catch (error) {
    console.error(`❌ Claude fetch error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

function getFallbackResponse(message) {
  const msg = message.toLowerCase();
  if (msg.includes('churn')) return 'O agente de Churn Prediction analisa engagement e histórico de pagamentos para identificar clientes em risco. Configure ANTHROPIC_API_KEY para análises reais com IA.';
  if (msg.includes('upsell') || msg.includes('venda')) return 'O agente de Upsell detecta clientes prontos para upgrade. Configure ANTHROPIC_API_KEY para recomendações personalizadas com IA.';
  if (msg.includes('financ') || msg.includes('mrr') || msg.includes('runway')) return 'O agente financeiro calcula MRR, ARR e runway. Configure ANTHROPIC_API_KEY para projeções avançadas com IA.';
  if (msg.includes('contrat')) return 'O agente de contratos detecta custos acima do mercado. Configure ANTHROPIC_API_KEY para análises detalhadas com IA.';
  return 'Configure ANTHROPIC_API_KEY nas variáveis do Railway para ativar a IA real. Posso ajudar com churn, upsell, finanças e contratos.';
}

// ============================================
// MIDDLEWARE
// ============================================
app.use(securityHeaders);
app.use(corsConfig);
app.use(requestLogger);
app.use(express.json({ limit: '10kb' }));
app.use(generalLimiter);

// Inicializa banco ao carregar o módulo
initializeDatabase().catch(err => console.error('DB init error:', err.message));

// ============================================
// AUTH ROUTES
// ============================================
app.post('/api/auth/register', authLimiter, registerValidation, validateRequest, async (req, res) => {
  try {
    const { email, password, name } = req.body;
    const result = await registerUser(email, password, name);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', authLimiter, loginValidation, validateRequest, async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await loginUser(email, password);
    if (!result.success) return res.status(401).json({ error: result.error });
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
const PUBLIC = path.join(process.cwd(), 'public');

app.use(express.static(PUBLIC));

app.get('/', (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC, 'auth.html')));
app.get('/register', (req, res) => res.sendFile(path.join(PUBLIC, 'auth.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(PUBLIC, 'dashboard.html')));
app.get('/integrations', (req, res) => res.sendFile(path.join(PUBLIC, 'integrations.html')));
app.get('/import', (req, res) => res.sendFile(path.join(PUBLIC, 'import.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(PUBLIC, 'admin.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(PUBLIC, 'contact.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC, 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(PUBLIC, 'terms.html')));
app.get('/onboarding', (req, res) => res.sendFile(path.join(PUBLIC, 'onboarding.html')));
app.get('/pipeline', (req, res) => res.sendFile(path.join(PUBLIC, 'pipeline.html')));
app.get('/inadimplencia', (req, res) => res.sendFile(path.join(PUBLIC, 'inadimplencia.html')));
app.get('/templates', (req, res) => res.sendFile(path.join(PUBLIC, 'templates.html')));
app.get('/historico', (req, res) => res.sendFile(path.join(PUBLIC, 'historico.html')));
app.get('/relatorios', (req, res) => res.sendFile(path.join(PUBLIC, 'relatorios.html')));
app.get('/emails', (req, res) => res.sendFile(path.join(PUBLIC, 'emails.html')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(PUBLIC, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(PUBLIC, 'manifest.json')));


// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: ANTHROPIC_API_KEY ? 'claude-connected' : 'not-configured',
    environment: process.env.VERCEL ? 'vercel' : 'server'
  });
});

// ============================================
// DASHBOARD OVERVIEW
// ============================================
app.get('/api/dashboard/overview', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const latestSnapshot = await database.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
    const pendingApprovals = await database.get(`SELECT COUNT(*) as count FROM approvals WHERE status = 'pending'`);
    const recentChurn = await database.get(`SELECT COUNT(*) as count FROM churn_predictions WHERE risk_level IN ('high', 'critical')`);
    const recentUpsell = await database.get(`SELECT COUNT(*) as count FROM upsell_opportunities WHERE status = 'pending'`);
    const totalCustomers = await database.get(`SELECT COUNT(*) as count FROM customers`);
    try { await logAudit(req.user.userId, 'VIEW', 'dashboard', null, null, null, req); } catch(e) {}
    res.json({
      financial_snapshot: latestSnapshot,
      pending_approvals: Number(pendingApprovals?.count) || 0,
      high_risk_customers: Number(recentChurn?.count) || 0,
      upsell_opportunities: Number(recentUpsell?.count) || 0,
      total_customers: Number(totalCustomers?.count) || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHURN
// ============================================
app.get('/api/churn/risks', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const risks = await database.all(`
      SELECT c.id, c.name, c.email, c.mrr, cp.risk_score, cp.risk_level, cp.created_at
      FROM churn_predictions cp JOIN customers c ON cp.customer_id = c.id
      WHERE cp.risk_level IN ('high', 'critical') ORDER BY cp.risk_score DESC LIMIT 50
    `);
    res.json(risks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/churn/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const database = await getDatabase();
    const customers = await database.all(`SELECT * FROM customers WHERE engagement_score < 40 ORDER BY engagement_score ASC LIMIT 15`);
    let decisions = 0;
    for (const customer of customers) {
      const riskLevel = customer.engagement_score < 15 ? 'critical' : customer.engagement_score < 25 ? 'high' : 'medium';
      const msg = `Olá ${customer.name}, notamos que seu engajamento está em ${customer.engagement_score}%. Gostaríamos de entender como podemos melhorar sua experiência e garantir que você esteja aproveitando ao máximo nossa plataforma.`;
      try {
        await database.run(`INSERT INTO churn_predictions (customer_id, risk_score, risk_level) VALUES (?, ?, ?)`,
          [customer.id, parseFloat(((100 - customer.engagement_score) / 100).toFixed(2)), riskLevel]);
      } catch(e) {}
      try {
        await database.run(`INSERT INTO approvals (agent_type, action_type, customer_id, decision_data, confidence_score, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['churn_prediction', 'apply_discount', customer.id,
           JSON.stringify({ retention_message: msg, customer_name: customer.name, risk_level: riskLevel }),
           0.85, 'pending',
           `${customer.name} — Risco ${riskLevel} — Eng: ${customer.engagement_score}% — MRR: R$${customer.mrr}`]);
        decisions++;
      } catch(e) {}
    }
    res.json({ success: true, result: { decisions_made: decisions, customers_analyzed: customers.length } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upsell/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const database = await getDatabase();
    const customers = await database.all(`SELECT * FROM customers WHERE engagement_score > 70 AND mrr > 0 ORDER BY mrr DESC LIMIT 15`);
    let decisions = 0;
    for (const customer of customers) {
      const pitch = `${customer.name}, seu alto engajamento de ${customer.engagement_score}% mostra que você aproveita muito bem nossa plataforma. Que tal conhecer nosso plano superior com recursos exclusivos que podem triplicar seus resultados?`;
      try {
        await database.run(`INSERT INTO upsell_opportunities (customer_id, opportunity_type, estimated_value, confidence_score, status) VALUES (?, ?, ?, ?, ?)`,
          [customer.id, 'plan_upgrade', parseFloat((customer.mrr * 0.5).toFixed(2)), 0.78, 'pending']);
      } catch(e) {}
      try {
        await database.run(`INSERT INTO approvals (agent_type, action_type, customer_id, decision_data, confidence_score, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['upsell_crosssell', 'send_upsell_offer', customer.id,
           JSON.stringify({ sales_pitch: pitch, customer_name: customer.name, estimated_value: customer.mrr * 0.5 }),
           0.78, 'pending',
           `${customer.name} — MRR R$${customer.mrr} — Eng: ${customer.engagement_score}%`]);
        decisions++;
      } catch(e) {}
    }
    res.json({ success: true, result: { decisions_made: decisions, customers_analyzed: customers.length } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/financial/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const database = await getDatabase();
    const totals = await database.get(`SELECT COUNT(*) as count, COALESCE(SUM(mrr),0) as total_mrr, COALESCE(AVG(engagement_score),0) as avg_eng FROM customers`);
    const mrr = Number(totals.total_mrr) || 0;
    const arr = mrr * 12;
    const burnRate = Number(process.env.MONTHLY_BURN_RATE) || 15000;
    const cashBalance = Number(process.env.CASH_BALANCE) || 300000;
    const runway = burnRate > 0 ? Math.round(cashBalance / burnRate) : 99;
    const churnRate = totals.count > 0 ? ((totals.count - totals.count * 0.95) / totals.count * 100).toFixed(1) : 0;
    await database.run(`INSERT INTO financial_snapshots (mrr, arr, runway_months, burn_rate, growth_rate, churn_rate, cash_balance) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [mrr, arr, runway, burnRate, 8.5, churnRate, cashBalance]);
    res.json({ success: true, result: { decisions_made: 1, mrr, arr, runway_months: runway } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contracts/trigger', authMiddleware, requireRole('admin', 'manager'), agentLimiter, async (req, res) => {
  try {
    const database = await getDatabase();
    const contracts = await database.all(`SELECT * FROM contracts WHERE deviation_percent > 10 AND status = 'active' LIMIT 10`);
    let decisions = 0;
    for (const contract of contracts) {
      const savings = Math.round((contract.annual_cost - contract.market_rate) * 0.7);
      const emailDraft = `Prezado(a) ${contract.vendor_name}, gostaríamos de revisar os termos do nosso contrato atual. Nossa análise indica que os valores estão ${Math.round(contract.deviation_percent)}% acima da taxa de mercado para serviços similares. Solicitamos uma reunião para discutir um ajuste que seja benéfico para ambas as partes, com economia potencial de R$${savings.toLocaleString()}/ano.`;
      try {
        await database.run(`INSERT INTO approvals (agent_type, action_type, contract_id, decision_data, confidence_score, status, details) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['contract_renegotiation', 'send_renegotiation_proposal', contract.id,
           JSON.stringify({ vendor_name: contract.vendor_name, email_draft: emailDraft, savings }),
           0.82, 'pending',
           `${contract.vendor_name} — +${Math.round(contract.deviation_percent)}% acima do mercado — Economia: R$${savings.toLocaleString()}`]);
        decisions++;
      } catch(e) {}
    }
    res.json({ success: true, result: { decisions_made: decisions, contracts_analyzed: contracts.length } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================
// UPSELL
// ============================================
app.get('/api/upsell/opportunities', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const opportunities = await database.all(`
      SELECT c.id, c.name, c.email, c.mrr, uo.opportunity_type, uo.estimated_value, uo.confidence_score, uo.status
      FROM upsell_opportunities uo JOIN customers c ON uo.customer_id = c.id
      WHERE uo.status = 'pending' ORDER BY uo.estimated_value DESC LIMIT 50
    `);
    res.json(opportunities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FINANCIAL
// ============================================
app.get('/api/financial/snapshot', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const snapshot = await database.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
    res.json(snapshot || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/financial/history', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const history = await database.all(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 100`);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTRACTS
// ============================================
app.get('/api/contracts/overpriced', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const contracts = await database.all(`SELECT * FROM contracts WHERE deviation_percent > 10 AND status = 'active' ORDER BY deviation_percent DESC`);
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// APPROVALS
// ============================================
app.post('/api/approvals/approve-all', authMiddleware, requireRole('admin', 'manager'), async (req, res) => {
  try {
    const database = await getDatabase();
    const pending = await database.all(`SELECT id FROM approvals WHERE status = 'pending'`);
    if (!pending.length) return res.json({ success: true, message: 'Nenhuma aprovação pendente', count: 0 });

    const results = [];
    for (const approval of pending) {
      const result = await approvalEngine.approveDecision(approval.id, req.user.userId);
      results.push({ id: approval.id, ...result });

      // Loga email no histórico
      if (result.email_sent) {
        try {
          const appr = await database.get('SELECT * FROM approvals WHERE id = ?', [approval.id]);
          const customer = appr?.customer_id ? await database.get('SELECT name, email FROM customers WHERE id = ?', [appr.customer_id]) : null;
          let decData = {};
          try { decData = JSON.parse(appr?.decision_data || '{}'); } catch(e) {}
          await database.run(
            `INSERT INTO email_history (user_id, approval_id, customer_id, customer_name, customer_email, subject, body, agent_type, action_type, channel, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [req.user.userId, approval.id, appr?.customer_id, customer?.name || decData.customer_name || '—', customer?.email || '', result.subject || 'Email enviado', decData.retention_message || decData.sales_pitch || decData.email_draft || decData.message || '', appr?.agent_type, appr?.action_type, 'email', 'sent']
          );
        } catch(e) {}
      }
    }

    const sent = results.filter(r => r.email_sent).length;
    const approved = results.filter(r => r.success).length;
    res.json({ success: true, message: `${approved} aprovações, ${sent} emails enviados`, count: approved, emailsSent: sent, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
    try { await logAudit(req.user.userId, 'APPROVE_DECISION', 'approval', req.params.id, null, result, req); } catch(e) {}

    // Loga no histórico de emails se email foi enviado
    if (result.email_sent) {
      try {
        const database = await getDatabase();
        const approval = await database.get('SELECT * FROM approvals WHERE id = ?', [req.params.id]);
        const customer = approval?.customer_id ? await database.get('SELECT name, email, whatsapp FROM customers WHERE id = ?', [approval.customer_id]) : null;
        let decData = {};
        try { decData = JSON.parse(approval?.decision_data || '{}'); } catch(e) {}
        await database.run(
          `INSERT INTO email_history (user_id, approval_id, customer_id, customer_name, customer_email, subject, body, agent_type, action_type, channel, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [req.user.userId, req.params.id, approval?.customer_id, customer?.name || decData.customer_name || 'Desconhecido', customer?.email || '', result.subject || 'Email enviado', decData.retention_message || decData.sales_pitch || decData.email_draft || decData.message || '', approval?.agent_type, approval?.action_type, 'email', 'sent']
        );
      } catch(e) {}
    }

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
    const database = await getDatabase();
    const logs = await database.all(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100`);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AUDIT
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
// CUSTOMERS & CONTRACTS
// ============================================
app.post('/api/customers', authMiddleware, requireRole('admin', 'manager'), customerValidation, validateRequest, async (req, res) => {
  try {
    const database = await getDatabase();
    const { name, email, mrr, engagement_score } = req.body;
    const result = await database.run(`INSERT INTO customers (name, email, mrr, engagement_score) VALUES (?, ?, ?, ?)`, [name, email, mrr || 0, engagement_score || 50]);
    try { await logAudit(req.user.userId, 'CREATE', 'customer', result.lastID, null, { name, email }, req); } catch(e) {}
    res.status(201).json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const customers = await database.all(`SELECT * FROM customers LIMIT 50`);
    res.json(customers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/contracts', authMiddleware, requireRole('admin', 'manager'), contractValidation, validateRequest, async (req, res) => {
  try {
    const database = await getDatabase();
    const { vendor_name, annual_cost, market_rate } = req.body;
    const deviation = market_rate ? parseFloat(((annual_cost - market_rate) / market_rate * 100).toFixed(2)) : 0;
    const result = await database.run(
      `INSERT INTO contracts (vendor_name, annual_cost, market_rate, deviation_percent) VALUES (?, ?, ?, ?)`,
      [vendor_name, annual_cost, market_rate, deviation]
    );
    res.status(201).json({ id: result.lastID, success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/contracts', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const contracts = await database.all(`SELECT * FROM contracts LIMIT 50`);
    res.json(contracts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CRON ENDPOINTS (Vercel Cron Jobs)
// ============================================
app.get('/api/cron/agents', async (req, res) => {
  // Vercel injeta o header automaticamente com CRON_SECRET
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('⏰ Cron: Disparando agentes automaticamente...');
    const db = await getDatabase();
    const results = {};

    // Churn
    try {
      const customers = await db.all('SELECT * FROM customers WHERE engagement_score < 40 ORDER BY engagement_score ASC LIMIT 15');
      let decisions = 0;
      for (const c of customers) {
        const rl = c.engagement_score < 15 ? 'critical' : c.engagement_score < 25 ? 'high' : 'medium';
        const msg = `Olá ${c.name}, notamos que seu engajamento está em ${c.engagement_score}%. Gostaríamos de entender como podemos melhorar sua experiência.`;
        try { await db.run("INSERT INTO approvals (agent_type,action_type,customer_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['churn_prediction','apply_discount',c.id,JSON.stringify({retention_message:msg,customer_name:c.name,risk_level:rl}),0.85,'pending',`${c.name} — Risco ${rl} — Eng: ${c.engagement_score}%`]); decisions++; } catch(e) {}
      }
      results.churn = { decisions_made: decisions };
    } catch(e) { results.churn = { error: e.message }; }

    // Financial
    try {
      const totals = await db.get('SELECT COALESCE(SUM(mrr),0) as total_mrr FROM customers');
      const mrr = Number(totals.total_mrr)||0;
      await db.run('INSERT INTO financial_snapshots (mrr,arr,runway_months,burn_rate,growth_rate,churn_rate,cash_balance) VALUES (?,?,?,?,?,?,?)', [mrr,mrr*12,Number(process.env.CASH_BALANCE||300000)/Number(process.env.MONTHLY_BURN_RATE||15000),Number(process.env.MONTHLY_BURN_RATE||15000),8.5,4.2,Number(process.env.CASH_BALANCE||300000)]);
      results.financial = { decisions_made: 1 };
    } catch(e) { results.financial = { error: e.message }; }

    console.log('✅ Cron: Agentes executados', results);
    res.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cron/upsell', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDatabase();
    const customers = await db.all('SELECT * FROM customers WHERE engagement_score > 70 AND mrr > 0 ORDER BY mrr DESC LIMIT 15');
    let decisions = 0;
    for (const c of customers) {
      const pitch = `${c.name}, seu engajamento de ${c.engagement_score}% é excelente! Que tal conhecer nosso plano superior?`;
      try { await db.run("INSERT INTO approvals (agent_type,action_type,customer_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['upsell_crosssell','send_upsell_offer',c.id,JSON.stringify({pitch,customer_name:c.name,estimated_value:c.mrr*0.5}),0.78,'pending',`${c.name} — MRR R$${c.mrr}`]); decisions++; } catch(e) {}
    }
    res.json({ success: true, result: { decisions_made: decisions } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cron/contracts', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDatabase();
    const contracts = await db.all("SELECT * FROM contracts WHERE deviation_percent > 10 AND status='active' LIMIT 10");
    let decisions = 0;
    for (const c of contracts) {
      const savings = Math.round((c.annual_cost - c.market_rate) * 0.7);
      const email = `Prezado ${c.vendor_name}, gostaríamos de revisar nosso contrato. Os valores estão ${Math.round(c.deviation_percent)}% acima do mercado. Economia potencial: R$${savings.toLocaleString('pt-BR')}.`;
      try { await db.run("INSERT INTO approvals (agent_type,action_type,contract_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['contract_renegotiation','send_renegotiation_proposal',c.id,JSON.stringify({vendor_name:c.vendor_name,email_draft:email,savings}),0.82,'pending',`${c.vendor_name} — +${Math.round(c.deviation_percent)}% — Economia R$${savings.toLocaleString('pt-BR')}`]); decisions++; } catch(e) {}
    }
    res.json({ success: true, result: { decisions_made: decisions } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ADMIN PANEL
// ============================================

// Setup inicial — promove user 1 a admin (só funciona se não tiver admin ainda)
app.post('/api/setup/admin', async (req, res) => {
  try {
    const database = await getDatabase();
    const adminExists = await database.get("SELECT id FROM users WHERE role = ? LIMIT 1", ['admin']);
    if (adminExists) return res.json({ message: 'Admin já existe', id: adminExists.id });
    await database.run("UPDATE users SET role = ? WHERE id = ?", ['admin', 1]);
    res.json({ success: true, message: 'Promovido a admin! Faça login novamente.' });
  } catch (error) {
    console.error('Setup admin error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Lista todos os clientes/usuários (só admin)
app.get('/api/admin/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const database = await getDatabase();
    const users = await database.all(
      "SELECT id, name, email, role, is_active, created_at, last_login FROM users ORDER BY created_at DESC"
    );
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cria conta de cliente e envia email de boas-vindas
app.post('/api/admin/create-client', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const database = await getDatabase();
    const { name, email, plan } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios' });

    const password = generatePassword();
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 12);

    const result = await database.run(
      'INSERT INTO users (name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?)',
      [name, email, passwordHash, 'user', 1]
    );
    const userId = result.lastID;

    const loginUrl = process.env.BASE_URL || 'https://neuralops-sage.vercel.app';
    const emailHtml = buildWelcomeEmail({ name, email, password, plan, loginUrl });

    let emailSent = false;
    try {
      if (process.env.RESEND_API_KEY) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'NeuralOps <onboarding@resend.dev>',
            to: [email],
            subject: `Bem-vindo ao NeuralOps, ${name}! 🚀`,
            html: emailHtml
          })
        });
        const emailData = await emailRes.json();
        emailSent = emailRes.ok;
        if (!emailRes.ok) console.log('Resend error:', JSON.stringify(emailData));
        else console.log(`✉️ Email enviado para ${email}:`, emailData.id);
      } else {
        console.log('RESEND_API_KEY não configurada');
      }
    } catch (e) {
      console.log('Email error:', e.message);
    }

    res.status(201).json({
      success: true, userId, name, email, password, emailSent,
      message: emailSent
        ? `Conta criada e email enviado para ${email}`
        : `Conta criada! Email não enviado — envie manualmente: Login: ${email} | Senha: ${password}`
    });
  } catch (error) {
    if (error.message?.includes('UNIQUE') || error.message?.includes('unique')) {
      return res.status(409).json({ error: 'Este email já tem uma conta cadastrada' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Ativa/desativa cliente
app.put('/api/admin/users/:id/status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const database = await getDatabase();
    const { active } = req.body;
    await database.run('UPDATE users SET is_active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reseta senha de cliente
app.post('/api/admin/users/:id/reset-password', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const database = await getDatabase();
    const newPassword = generatePassword();
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(newPassword, 12);
    await database.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.params.id]);
    const user = await database.get('SELECT name, email FROM users WHERE id = ?', [req.params.id]);
    res.json({ success: true, newPassword, email: user?.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  let pwd = '';
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  return pwd;
}

function buildWelcomeEmail({ name, email, password, plan, loginUrl }) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0d1420,#111827);padding:40px;text-align:center;border-bottom:1px solid #1e2d42;">
    <h1 style="color:#f0f8ff;font-size:28px;margin:0;letter-spacing:-1px;">N<span style="color:#00d4ff;">euralOps</span></h1>
    <p style="color:#4a6480;font-size:12px;margin:8px 0 0;letter-spacing:2px;text-transform:uppercase;">Agentes Autônomos de Negócios</p>
  </div>
  <div style="padding:40px;">
    <h2 style="color:#f0f8ff;font-size:22px;margin:0 0 16px;">Bem-vindo, ${name}! 🚀</h2>
    <p style="color:#7a9bb8;font-size:15px;line-height:1.7;margin:0 0 24px;">Sua conta no NeuralOps está pronta. Abaixo estão seus dados de acesso:</p>
    
    <div style="background:#0d1420;border:1px solid #1e2d42;border-radius:6px;padding:24px;margin:0 0 24px;">
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:#4a6480;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">EMAIL</div>
        <div style="font-size:16px;color:#00d4ff;font-family:monospace;">${email}</div>
      </div>
      <div>
        <div style="font-size:11px;color:#4a6480;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:6px;">SENHA TEMPORÁRIA</div>
        <div style="font-size:20px;color:#00ff88;font-family:monospace;letter-spacing:2px;">${password}</div>
      </div>
    </div>

    <p style="color:#7a9bb8;font-size:13px;margin:0 0 24px;">⚠️ Troque sua senha após o primeiro acesso.</p>
    
    <div style="text-align:center;margin:32px 0;">
      <a href="${loginUrl}/login" style="background:#00d4ff;color:#05060a;padding:14px 40px;border-radius:4px;font-weight:700;font-size:14px;text-decoration:none;letter-spacing:0.5px;display:inline-block;">
        ACESSAR PLATAFORMA →
      </a>
    </div>

    ${plan ? `<p style="color:#4a6480;font-size:13px;text-align:center;margin:0;">Plano: <strong style="color:#7a9bb8;">${plan}</strong></p>` : ''}
  </div>
  <div style="padding:20px 40px;border-top:1px solid #1e2d42;text-align:center;">
    <p style="color:#4a6480;font-size:12px;margin:0;">NeuralOps · Dúvidas? Responda este email.</p>
  </div>
</div>
</body>
</html>`;
}

// ============================================
// EMAIL HISTORY
// ============================================
app.get('/api/email-history', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const history = await db.all(
      'SELECT * FROM email_history WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?',
      [req.user.userId, limit]
    );
    const stats = await db.get(
      `SELECT COUNT(*) as total, COUNT(CASE WHEN DATE(sent_at) = CURRENT_DATE THEN 1 END) as today, COUNT(CASE WHEN sent_at >= NOW() - INTERVAL '30 days' THEN 1 END) as month FROM email_history WHERE user_id = ?`,
      [req.user.userId]
    );
    res.json({ history, stats: stats || { total: 0, today: 0, month: 0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// WHATSAPP
// ============================================
app.post('/api/whatsapp/send', authMiddleware, async (req, res) => {
  try {
    const { phone, message, customer_name } = req.body;
    if (!phone || !message) return res.status(400).json({ error: 'Telefone e mensagem são obrigatórios' });

    const cleanPhone = phone.replace(/\D/g, '');
    const instanceId = process.env.ZAPI_INSTANCE_ID;
    const zapToken = process.env.ZAPI_TOKEN;

    // Tenta Z-API se configurado
    if (instanceId && zapToken) {
      try {
        const r = await fetch(`https://api.z-api.io/instances/${instanceId}/token/${zapToken}/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: cleanPhone, message })
        });
        const data = await r.json();
        if (r.ok) {
          // Loga no histórico
          const db = await getDatabase();
          await db.run(
            'INSERT INTO email_history (user_id, customer_name, customer_email, body, agent_type, channel, status) VALUES (?,?,?,?,?,?,?)',
            [req.user.userId, customer_name || 'Cliente', phone, message, 'whatsapp', 'whatsapp', 'sent']
          );
          return res.json({ success: true, via: 'zapi', messageId: data.zaapId });
        }
      } catch(e) {}
    }

    // Fallback: retorna link wa.me
    const encoded = encodeURIComponent(message);
    const waLink = `https://wa.me/${cleanPhone}?text=${encoded}`;
    res.json({ success: true, via: 'link', url: waLink, message: 'Abra o link para enviar via WhatsApp Web' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/:id/whatsapp', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { whatsapp } = req.body;
    await db.run('UPDATE customers SET whatsapp = ? WHERE id = ?', [whatsapp, req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// EMAIL HISTORY
// ============================================
app.get('/api/settings', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    let settings = await database.get('SELECT * FROM user_settings WHERE user_id = ?', [req.user.userId]);
    if (!settings) {
      await database.run('INSERT INTO user_settings (user_id) VALUES (?)', [req.user.userId]);
      settings = await database.get('SELECT * FROM user_settings WHERE user_id = ?', [req.user.userId]);
    }
    res.json({ settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/settings', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const {
      company_name, company_segment, job_title, phone,
      avatar_color, theme, language, currency, timezone,
      mrr_goal, growth_goal,
      notify_churn, notify_upsell, notify_approval_expire,
      notify_slack, notify_email, report_frequency
    } = req.body;

    const existing = await database.get('SELECT id FROM user_settings WHERE user_id = ?', [req.user.userId]);
    if (existing) {
      await database.run(`UPDATE user_settings SET
        company_name=?, company_segment=?, job_title=?, phone=?,
        avatar_color=?, theme=?, language=?, currency=?, timezone=?,
        mrr_goal=?, growth_goal=?,
        notify_churn=?, notify_upsell=?, notify_approval_expire=?,
        notify_slack=?, notify_email=?, report_frequency=?,
        updated_at=NOW() WHERE user_id=?`,
        [company_name, company_segment, job_title, phone,
         avatar_color, theme, language, currency, timezone,
         mrr_goal||0, growth_goal||0,
         notify_churn, notify_upsell, notify_approval_expire,
         notify_slack, notify_email, report_frequency,
         req.user.userId]);
    } else {
      await database.run(`INSERT INTO user_settings
        (user_id, company_name, company_segment, job_title, phone,
         avatar_color, theme, language, currency, timezone,
         mrr_goal, growth_goal,
         notify_churn, notify_upsell, notify_approval_expire,
         notify_slack, notify_email, report_frequency)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [req.user.userId, company_name, company_segment, job_title, phone,
         avatar_color, theme, language, currency, timezone,
         mrr_goal||0, growth_goal||0,
         notify_churn, notify_upsell, notify_approval_expire,
         notify_slack, notify_email, report_frequency]);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings/login-history', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const history = await database.all(
      'SELECT * FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
      [req.user.userId]
    );
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PROFILE / SETTINGS
// ============================================
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const user = await database.get(
      'SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?',
      [req.user.userId]
    );
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
    await database.run(
      'UPDATE users SET name = ?, updated_at = NOW() WHERE id = ?',
      [name.trim(), req.user.userId]
    );
    res.json({ success: true, message: 'Perfil atualizado!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/auth/password', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Campos obrigatórios' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Nova senha deve ter ao menos 8 caracteres' });
    const user = await database.get('SELECT password_hash FROM users WHERE id = ?', [req.user.userId]);
    const bcrypt = await import('bcryptjs');
    const match = await bcrypt.default.compare(currentPassword, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Senha atual incorreta' });
    const hash = await bcrypt.default.hash(newPassword, 10);
    await database.run('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, req.user.userId]);
    res.json({ success: true, message: 'Senha alterada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GMAIL OAUTH
// ============================================
app.get('/api/auth/gmail', authMiddleware, async (req, res) => {
  try {
    const authUrl = getGoogleAuthUrl(req.user.userId);
    res.json({ url: authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/gmail/callback', async (req, res) => {
  try {
    const { code, state: userId, error } = req.query;

    if (error) {
      return res.redirect('/dashboard?gmail=error&msg=' + encodeURIComponent(error));
    }

    if (!code || !userId) {
      return res.redirect('/dashboard?gmail=error&msg=missing_params');
    }

    const tokens = await exchangeCodeForTokens(code);
    const emailAddress = await getGoogleUserEmail(tokens.access_token);
    const expiry = new Date(Date.now() + tokens.expires_in * 1000);

    const database = await getDatabase();

    const existing = await database.get('SELECT id FROM email_connections WHERE user_id = ?', [userId]);

    if (existing) {
      await database.run(
        'UPDATE email_connections SET access_token = ?, refresh_token = ?, token_expiry = ?, email_address = ?, updated_at = ? WHERE user_id = ?',
        [tokens.access_token, tokens.refresh_token, expiry.toISOString(), emailAddress, new Date().toISOString(), userId]
      );
    } else {
      await database.run(
        'INSERT INTO email_connections (user_id, provider, email_address, access_token, refresh_token, token_expiry) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, 'gmail', emailAddress, tokens.access_token, tokens.refresh_token, expiry.toISOString()]
      );
    }

    console.log(`✅ Gmail conectado para usuário ${userId}: ${emailAddress}`);
    res.redirect('/dashboard?gmail=connected&email=' + encodeURIComponent(emailAddress));
  } catch (error) {
    console.error('Gmail OAuth error:', error);
    res.redirect('/dashboard?gmail=error&msg=' + encodeURIComponent(error.message));
  }
});

app.get('/api/auth/gmail/status', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const connection = await database.get(
      'SELECT email_address, provider, updated_at FROM email_connections WHERE user_id = ?',
      [req.user.userId]
    );
    res.json({ connected: !!connection, connection });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/auth/gmail/disconnect', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    await database.run('DELETE FROM email_connections WHERE user_id = ?', [req.user.userId]);
    res.json({ success: true, message: 'Gmail desconectado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// INTEGRATIONS API
// ============================================

// Status de todas integrações
app.get('/api/integrations/status', authMiddleware, async (req, res) => {
  const connected = [];
  try {
    const database = await getDatabase();
    const gmailConn = await database.get('SELECT id FROM email_connections WHERE user_id = ?', [req.user.userId]);
    if (gmailConn) connected.push('gmail');
    if (process.env.STRIPE_SECRET_KEY) connected.push('stripe');
    if (process.env.SLACK_WEBHOOK_URL) connected.push('slack');
    if (process.env.ZAPI_INSTANCE_ID && process.env.ZAPI_TOKEN) connected.push('whatsapp');
  } catch(e) {}
  res.json({ connected });
});

// Stripe — sincronizar clientes
app.post('/api/integrations/stripe', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || (!apiKey.startsWith('sk_live_') && !apiKey.startsWith('sk_test_'))) {
      return res.status(400).json({ error: 'Chave inválida' });
    }
    process.env.STRIPE_SECRET_KEY = apiKey;
    const stripe = await getSyncStripe();
    if (!stripe) return res.status(500).json({ error: 'Stripe service não disponível' });
    const database = await getDatabase();
    const result = await stripe.syncStripeCustomers(database);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stripe — webhook
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = await getSyncStripe();
    if (!stripe) return res.status(500).json({ error: 'Stripe service não disponível' });
    const signature = req.headers['stripe-signature'];
    const database = await getDatabase();
    const result = await stripe.handleStripeWebhook(req.body.toString(), signature, database);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Slack — salvar e testar
app.post('/api/integrations/slack', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { webhookUrl } = req.body;
    if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({ error: 'URL inválida' });
    }
    process.env.SLACK_WEBHOOK_URL = webhookUrl;
    const slack = await getSlack();
    if (!slack) return res.status(500).json({ error: 'Slack service não disponível' });
    const result = await slack.sendSlackNotification(webhookUrl, {
      text: '✅ NeuralOps conectado ao Slack!'
    });
    res.json({ success: result.success, error: result.error });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WhatsApp — salvar e testar
app.post('/api/integrations/whatsapp', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { instanceId, token: zapToken } = req.body;
    if (!instanceId || !zapToken) return res.status(400).json({ error: 'Campos obrigatórios' });
    process.env.ZAPI_INSTANCE_ID = instanceId;
    process.env.ZAPI_TOKEN = zapToken;
    const wa = await getWhatsApp();
    if (!wa) return res.status(500).json({ error: 'WhatsApp service não disponível' });
    const status = await wa.checkZAPIStatus();
    res.json({ success: status.connected, phone: status.phone, error: status.error });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook genérico — recebe dados de Zapier/Make/n8n
app.post('/api/webhooks/import', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token necessário' });
    }
    const database = await getDatabase();
    const customers = Array.isArray(req.body) ? req.body : [req.body];
    let created = 0;
    for (const c of customers) {
      if (!c.name && !c.email) continue;
      try {
        const name = c.name || c.email?.split('@')[0] || 'Cliente';
        const email = c.email || null;
        const mrr = parseFloat(c.mrr || c.revenue || 0) || 0;
        const engagement = parseInt(c.engagement_score || c.score || 50) || 50;
        const existing = email ? await database.get('SELECT id FROM customers WHERE email = ?', [email]) : null;
        if (!existing) {
          await database.run('INSERT INTO customers (name, email, mrr, engagement_score) VALUES (?, ?, ?, ?)', [name, email, mrr, engagement]);
          created++;
        }
      } catch(e) {}
    }
    res.json({ success: true, created, total: customers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTACT FORM
// ============================================
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, company, mrr, challenge } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    
    // Log no console (você verá no Railway)
    console.log(`\n📩 NOVO CONTATO RECEBIDO:`);
    console.log(`   Nome: ${name}`);
    console.log(`   Email: ${email}`);
    console.log(`   Empresa: ${company || 'Não informado'}`);
    console.log(`   MRR: ${mrr || 'Não informado'}`);
    console.log(`   Desafio: ${challenge || 'Não informado'}\n`);

    res.json({ success: true, message: 'Mensagem recebida! Entraremos em contato em até 24 horas.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/chat', authMiddleware, chatValidation, validateRequest, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    // Buscar dados reais do banco para contexto
    let contextData = {};
    try {
      const database = await getDatabase();
      const snapshot = await database.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
      const churnCount = await database.get(`SELECT COUNT(*) as count FROM churn_predictions WHERE risk_level IN ('high','critical')`);
      const upsellCount = await database.get(`SELECT COUNT(*) as count FROM upsell_opportunities WHERE status='pending'`);
      const customerCount = await database.get(`SELECT COUNT(*) as count, ROUND(AVG(mrr),2) as avg_mrr, SUM(mrr) as total_mrr FROM customers`);
      const pendingApprovals = await database.get(`SELECT COUNT(*) as count FROM approvals WHERE status='pending'`);
      contextData = { snapshot, churnCount, upsellCount, customerCount, pendingApprovals };
    } catch (e) {}

    const systemPrompt = `Você é o NeuralOps AI — assistente de inteligência de negócios para SaaS.

DADOS DO SISTEMA:
${JSON.stringify(contextData, null, 2)}

REGRAS:
- Responda em português brasileiro
- Máximo 120 palavras por resposta
- Use **negrito** para destacar números e métricas importantes
- Use listas com "- " apenas para 3+ itens
- Seja direto: responda a pergunta sem introduções
- Use apenas dados reais acima — nunca invente números
- Se o banco estiver vazio, diga em 1 frase e sugira disparar os agentes`;

    const aiResult = await callClaude(systemPrompt, message, 600);

    let response;
    let aiPowered = false;

    if (aiResult.success) {
      response = aiResult.text;
      aiPowered = true;
    } else {
      console.error('Chat AI error:', aiResult.error);
      response = `⚠️ Erro na IA: ${aiResult.error}\n\n${getFallbackResponse(message)}`;
    }

    await logAudit(req.user.userId, 'CHAT_MESSAGE', 'chat', null, null, { message: message.substring(0, 100) }, req);
    res.json({ response, type: 'chat', ai_powered: aiPowered });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// AI ANALYSIS ENDPOINTS
// ============================================
app.post('/api/ai/analyze-customer/:id', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const customer = await database.get(`SELECT * FROM customers WHERE id = ?`, [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const predictions = await database.all(`SELECT * FROM churn_predictions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`, [req.params.id]);
    const upsell = await database.all(`SELECT * FROM upsell_opportunities WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`, [req.params.id]);

    const result = await callClaude(
      'Você é analista SaaS. Responda APENAS com JSON válido em português.',
      `Analise este cliente e retorne JSON com: risk_level (low/medium/high/critical), churn_probability_percent (número), upsell_potential (low/medium/high), recommended_actions (array de strings), summary (string).

Cliente: ${JSON.stringify(customer)}
Predictions: ${JSON.stringify(predictions)}
Upsell: ${JSON.stringify(upsell)}`,
      512
    );

    if (result.success) {
      try { res.json({ success: true, analysis: JSON.parse(result.text), customer }); }
      catch { res.json({ success: true, analysis: result.text, customer }); }
    } else {
      res.json({ success: false, error: result.error, customer });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/ai/financial-insights', authMiddleware, async (req, res) => {
  try {
    const database = await getDatabase();
    const snapshots = await database.all(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 12`);
    const customers = await database.get(`SELECT COUNT(*) as count, ROUND(AVG(mrr),2) as avg_mrr, SUM(mrr) as total_mrr FROM customers`);

    const result = await callClaude(
      'Você é CFO virtual SaaS. Responda APENAS com JSON válido em português.',
      `Analise estes dados e retorne JSON com: trend (growing/stable/declining), growth_rate_percent (número), runway_months (número), top_risks (array), recommendations (array), forecast_90_days (objeto com mrr_projected e arr_projected).

Snapshots: ${JSON.stringify(snapshots)}
Clientes: ${JSON.stringify(customers)}`,
      512
    );

    if (result.success) {
      try { res.json({ success: true, insights: JSON.parse(result.text) }); }
      catch { res.json({ success: true, insights: result.text }); }
    } else {
      res.json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ============================================
// APPROVALS HISTORY
// ============================================
app.get('/api/approvals/history', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const history = await db.all(`SELECT a.*, c.name as customer_name, c.email as customer_email FROM approvals a LEFT JOIN customers c ON a.customer_id = c.id WHERE a.status IN ('approved', 'rejected') ORDER BY a.created_at DESC LIMIT 100`);
    res.json({ history });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// BUSINESS PROFILE & SEGMENT
// ============================================
app.get('/api/business/profile', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    let profile = await db.get('SELECT * FROM business_profiles WHERE user_id = ?', [req.user.userId]);
    if (!profile) { await db.run('INSERT INTO business_profiles (user_id) VALUES (?)', [req.user.userId]); profile = await db.get('SELECT * FROM business_profiles WHERE user_id = ?', [req.user.userId]); }
    res.json({ profile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/business/profile', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { segment, company_size, monthly_revenue, customer_count, main_challenge, white_label_name, white_label_color, onboarding_completed, onboarding_step } = req.body;
    const ex = await db.get('SELECT id FROM business_profiles WHERE user_id = ?', [req.user.userId]);
    if (ex) {
      await db.run('UPDATE business_profiles SET segment=COALESCE(?,segment), company_size=COALESCE(?,company_size), monthly_revenue=COALESCE(?,monthly_revenue), customer_count=COALESCE(?,customer_count), main_challenge=COALESCE(?,main_challenge), white_label_name=COALESCE(?,white_label_name), white_label_color=COALESCE(?,white_label_color), onboarding_completed=COALESCE(?,onboarding_completed), onboarding_step=COALESCE(?,onboarding_step), updated_at=NOW() WHERE user_id=?',
        [segment, company_size, monthly_revenue, customer_count, main_challenge, white_label_name, white_label_color, onboarding_completed, onboarding_step, req.user.userId]);
    } else {
      await db.run('INSERT INTO business_profiles (user_id,segment,company_size,monthly_revenue,customer_count,main_challenge,white_label_name,white_label_color,onboarding_completed,onboarding_step) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [req.user.userId, segment||'saas', company_size||'micro', monthly_revenue||0, customer_count||0, main_challenge, white_label_name, white_label_color, onboarding_completed||false, onboarding_step||0]);
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// SALES PIPELINE
// ============================================
app.get('/api/sales/pipeline', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); const leads = await db.all('SELECT * FROM sales_pipeline WHERE user_id = ? ORDER BY deal_value DESC', [req.user.userId]); res.json({ leads }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sales/pipeline', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { lead_name, lead_email, lead_phone, company, deal_value, stage, probability, notes, expected_close } = req.body;
    if (!lead_name) return res.status(400).json({ error: 'Nome do lead é obrigatório' });
    const result = await db.run('INSERT INTO sales_pipeline (user_id,lead_name,lead_email,lead_phone,company,deal_value,stage,probability,notes,expected_close) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.user.userId, lead_name, lead_email, lead_phone, company, deal_value||0, stage||'prospect', probability||30, notes, expected_close]);
    res.status(201).json({ success: true, id: result.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/sales/pipeline/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    await db.run('UPDATE sales_pipeline SET stage=COALESCE(?,stage), probability=COALESCE(?,probability), notes=COALESCE(?,notes), deal_value=COALESCE(?,deal_value), last_contact=COALESCE(?,last_contact), updated_at=NOW() WHERE id=? AND user_id=?',
      [req.body.stage, req.body.probability, req.body.notes, req.body.deal_value, req.body.last_contact, req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/sales/pipeline/:id', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); await db.run('DELETE FROM sales_pipeline WHERE id=? AND user_id=?', [req.params.id, req.user.userId]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/sales/trigger', authMiddleware, agentLimiter, async (req, res) => {
  try {
    const db = await getDatabase();
    const leads = await db.all("SELECT * FROM sales_pipeline WHERE user_id=? AND stage NOT IN ('won','lost')", [req.user.userId]);
    let decisions = 0;
    for (const lead of leads.slice(0,10)) {
      if ((lead.probability||0) >= 60) {
        try { await db.run("INSERT INTO approvals (agent_type,action_type,customer_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['sales_pipeline','send_sales_proposal',lead.id,JSON.stringify({lead_name:lead.lead_name,lead_email:lead.lead_email,deal_value:lead.deal_value}),(lead.probability||60)/100,'pending',`${lead.lead_name} — ${lead.probability}% prob — R$${(lead.deal_value||0).toLocaleString('pt-BR')}`]); decisions++; } catch(err) {}
      }
    }
    res.json({ success:true, result:{ decisions_made:decisions, leads_analyzed:leads.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// INADIMPLÊNCIA
// ============================================
app.get('/api/delinquency/records', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); const records = await db.all('SELECT d.*, c.name as customer_name, c.email as customer_email FROM delinquency_records d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.user_id=? ORDER BY d.days_overdue DESC', [req.user.userId]); res.json({ records }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/delinquency/records', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { customer_id, amount, due_date, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor é obrigatório' });
    const dueDate = due_date ? new Date(due_date) : new Date();
    const days = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000));
    const result = await db.run('INSERT INTO delinquency_records (customer_id,user_id,amount,due_date,days_overdue,notes) VALUES (?,?,?,?,?,?)', [customer_id||null, req.user.userId, amount, dueDate.toISOString(), days, notes]);
    res.status(201).json({ success:true, id:result.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/delinquency/records/:id', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); await db.run('UPDATE delinquency_records SET status=COALESCE(?,status), notes=COALESCE(?,notes), last_contact=NOW() WHERE id=? AND user_id=?', [req.body.status, req.body.notes, req.params.id, req.user.userId]); res.json({ success:true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/delinquency/trigger', authMiddleware, agentLimiter, async (req, res) => {
  try {
    const db = await getDatabase();
    const customers = await db.all('SELECT * FROM customers WHERE engagement_score < 20 AND mrr > 0 ORDER BY mrr DESC LIMIT 10');
    let decisions = 0;
    for (const c of customers) {
      try {
        const ex = await db.get("SELECT id FROM approvals WHERE customer_id=? AND action_type='payment_followup' AND status='pending'", [c.id]);
        if (!ex) { await db.run("INSERT INTO approvals (agent_type,action_type,customer_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['delinquency','payment_followup',c.id,JSON.stringify({customer_name:c.name,amount:c.mrr}),0.85,'pending',`${c.name} — R$${c.mrr}/mês — Verificar pagamento`]); decisions++; }
      } catch(err) {}
    }
    res.json({ success:true, result:{ decisions_made:decisions, customers_analyzed:customers.length } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// TEMPLATES
// ============================================
app.get('/api/templates', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); res.json({ templates: await db.all('SELECT * FROM email_templates WHERE user_id=? ORDER BY usage_count DESC', [req.user.userId]) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/templates', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, category, subject, body, tone, segment } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'Nome e corpo obrigatórios' });
    const r = await db.run('INSERT INTO email_templates (user_id,name,category,subject,body,tone,segment) VALUES (?,?,?,?,?,?,?)', [req.user.userId, name, category||'retention', subject, body, tone||'professional', segment||'all']);
    res.status(201).json({ success:true, id:r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/templates/:id', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); await db.run('UPDATE email_templates SET name=COALESCE(?,name), subject=COALESCE(?,subject), body=COALESCE(?,body), tone=COALESCE(?,tone), updated_at=NOW() WHERE id=? AND user_id=?', [req.body.name, req.body.subject, req.body.body, req.body.tone, req.params.id, req.user.userId]); res.json({ success:true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/templates/:id', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); await db.run('DELETE FROM email_templates WHERE id=? AND user_id=?', [req.params.id, req.user.userId]); res.json({ success:true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/templates/generate', authMiddleware, async (req, res) => {
  try {
    const { category, tone, segment, context } = req.body;
    const catNames = { retention:'retenção de cliente',upsell:'proposta de upgrade',delinquency:'cobrança amigável',sales:'proposta comercial',welcome:'boas-vindas' };
    const result = await callClaude(`Copywriting expert. Tom: ${tone||'profissional'}. Responda SOMENTE JSON: {"subject":"...","body":"..."}`, `Email de ${catNames[category]||category} para ${segment||'negócios'}. Contexto: ${context||''}. Use {{nome}}.`, 400);
    if (result.success) {
      try { return res.json({ success:true, template:JSON.parse(result.text.replace(/\`\`\`json|\`\`\`/g,'').trim()) }); } catch(e) { return res.json({ success:true, template:{ subject:'Template', body:result.text } }); }
    }
    res.status(500).json({ error:'Erro ao gerar template' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// METAS
// ============================================
app.get('/api/goals', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const goals = await db.all('SELECT * FROM business_goals WHERE user_id=? ORDER BY created_at DESC', [req.user.userId]);
    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
    const cc = await db.get('SELECT COUNT(*) as count FROM customers');
    res.json({ goals, current:{ mrr:snap?.mrr||0, customers:cc?.count||0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/goals', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { goal_type, target_value, period, deadline } = req.body;
    if (!goal_type || !target_value) return res.status(400).json({ error: 'Tipo e meta obrigatórios' });
    const ex = await db.get('SELECT id FROM business_goals WHERE user_id=? AND goal_type=?', [req.user.userId, goal_type]);
    if (ex) { await db.run('UPDATE business_goals SET target_value=?, period=?, deadline=?, updated_at=NOW() WHERE user_id=? AND goal_type=?', [target_value, period||'monthly', deadline, req.user.userId, goal_type]); }
    else { await db.run('INSERT INTO business_goals (user_id,goal_type,target_value,period,deadline) VALUES (?,?,?,?,?)', [req.user.userId, goal_type, target_value, period||'monthly', deadline]); }
    res.json({ success:true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// RELATÓRIOS
// ============================================
app.get('/api/reports/summary', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const days = req.query.period==='7d'?7:req.query.period==='90d'?90:30;
    const since = new Date(Date.now()-days*86400000).toISOString();
    const [snap, approvals, customers, pipeline] = await Promise.all([
      db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1'),
      db.all('SELECT * FROM approvals WHERE created_at >= ? ORDER BY created_at DESC', [since]),
      db.get('SELECT COUNT(*) as count, COALESCE(SUM(mrr),0) as total_mrr, COALESCE(AVG(engagement_score),0) as avg_engagement FROM customers'),
      db.all('SELECT * FROM sales_pipeline WHERE user_id=?', [req.user.userId])
    ]);
    const emailsSent = approvals.filter(a=>a.status==='approved').length;
    const pipelineValue = pipeline.filter(p=>!['won','lost'].includes(p.stage)).reduce((s,p)=>s+(p.deal_value||0),0);
    const wonDeals = pipeline.filter(p=>p.stage==='won').reduce((s,p)=>s+(p.deal_value||0),0);
    const ai = await callClaude('Analista. Responda em português, 2-3 frases.', `Resumo ${days} dias: MRR R$${snap?.mrr||0}, Clientes ${customers.count}, Decisões ${approvals.length}, Emails ${emailsSent}, Pipeline R$${pipelineValue.toFixed(0)}.`, 150);
    res.json({ period:req.query.period||'30d', snapshot:snap, metrics:{ total_decisions:approvals.length, emails_sent:emailsSent, customers:customers.count, total_mrr:customers.total_mrr, avg_engagement:Math.round(customers.avg_engagement||0), pipeline_value:pipelineValue, won_deals:wonDeals }, summary:ai.success?ai.text:'Relatório gerado.', approvals:approvals.slice(0,10) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/reports/history', authMiddleware, async (req, res) => {
  try { const db = await getDatabase(); res.json({ history: await db.all('SELECT * FROM report_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.user.userId]) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// PLANOS
// ============================================
const PLANS = {
  starter: { name:'Starter', price:49, customers_limit:100, emails_limit:200, agents:3, features:['3 Agentes','100 Clientes','200 Emails/mês'] },
  growth: { name:'Growth', price:149, customers_limit:500, emails_limit:1000, agents:6, features:['6 Agentes','500 Clientes','Relatórios','Pipeline'] },
  enterprise: { name:'Enterprise', price:499, customers_limit:99999, emails_limit:99999, agents:99, features:['Ilimitado','API Pública','White Label'] }
};
app.get('/api/plans', (req, res) => { res.json({ plans: PLANS }); });
app.get('/api/plans/current', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const profile = await db.get('SELECT plan FROM business_profiles WHERE user_id=?', [req.user.userId]);
    const planKey = profile?.plan || 'starter';
    const cc = await db.get('SELECT COUNT(*) as count FROM customers');
    res.json({ plan:{ ...PLANS[planKey], key:planKey }, usage:{ customers:cc?.count||0 } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// API PÚBLICA
// ============================================
app.post('/api/public/customers', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API Key necessária' });
    const jwt = await import('jsonwebtoken');
    try { jwt.default.verify(apiKey, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'API Key inválida' }); }
    const db = await getDatabase();
    const { name, email, mrr, engagement_score } = req.body;
    if (!name) return res.status(400).json({ error: 'name obrigatório' });
    const r = await db.run('INSERT INTO customers (name,email,mrr,engagement_score) VALUES (?,?,?,?) ON CONFLICT (email) DO UPDATE SET mrr=EXCLUDED.mrr, engagement_score=EXCLUDED.engagement_score, updated_at=NOW()', [name, email, mrr||0, engagement_score||50]);
    res.status(201).json({ success:true, id:r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/public/customers', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'API Key necessária' });
    const jwt = await import('jsonwebtoken');
    try { jwt.default.verify(apiKey, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'API Key inválida' }); }
    const db = await getDatabase();
    res.json({ customers: await db.all('SELECT id,name,email,mrr,engagement_score,created_at FROM customers LIMIT 100') });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================
// HEALTH SCORE
// ============================================
app.get('/api/health-score', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();

    const [customers, approvals, goals, pipeline, delinquency] = await Promise.all([
      db.get('SELECT COUNT(*) as total, COALESCE(AVG(engagement_score),0) as avg_eng, COALESCE(SUM(mrr),0) as total_mrr FROM customers'),
      db.get("SELECT COUNT(*) as pending FROM approvals WHERE status='pending'"),
      db.all('SELECT * FROM business_goals WHERE user_id=?', [req.user.userId]),
      db.all("SELECT * FROM sales_pipeline WHERE user_id=? AND stage NOT IN ('won','lost')", [req.user.userId]),
      db.get("SELECT COUNT(*) as overdue FROM delinquency_records WHERE user_id=? AND status!='paid'", [req.user.userId])
    ]);

    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');

    // Calcula score por dimensão (0-20 cada = 100 total)
    const avgEng = Number(customers.avg_eng) || 0;
    const churnRate = Number(snap?.churn_rate) || 0;
    const runway = Number(snap?.runway_months) || 0;
    const pipelineVal = pipeline.reduce((s,p)=>s+(p.deal_value||0),0);
    const overdueCount = Number(delinquency?.overdue) || 0;

    const engScore    = Math.round(Math.min(20, (avgEng / 100) * 20));
    const churnScore  = Math.round(Math.min(20, Math.max(0, 20 - churnRate * 2)));
    const runwayScore = Math.round(Math.min(20, (Math.min(runway, 24) / 24) * 20));
    const pipelineScore = Math.round(Math.min(20, pipelineVal > 0 ? 15 + (Math.min(pipelineVal, 50000) / 50000) * 5 : 5));
    const delinqScore = Math.round(Math.min(20, Math.max(0, 20 - overdueCount * 3)));
    const total = engScore + churnScore + runwayScore + pipelineScore + delinqScore;

    const level = total >= 80 ? 'Excelente' : total >= 60 ? 'Bom' : total >= 40 ? 'Regular' : 'Crítico';
    const color = total >= 80 ? '#00ff88' : total >= 60 ? '#00d4ff' : total >= 40 ? '#ff6b35' : '#ff4466';

    // Salva histórico
    try {
      await db.run('INSERT INTO health_scores (user_id,score,churn_score,revenue_score,engagement_score,pipeline_score,goals_score) VALUES (?,?,?,?,?,?,?)',
        [req.user.userId, total, churnScore, runwayScore, engScore, pipelineScore, delinqScore]);
    } catch(e) {}

    // Histórico dos últimos 7 dias
    const history = await db.all('SELECT score, recorded_at FROM health_scores WHERE user_id=? ORDER BY recorded_at DESC LIMIT 7', [req.user.userId]);

    res.json({
      score: total, level, color,
      dimensions: { engagement: engScore, churn: churnScore, runway: runwayScore, pipeline: pipelineScore, delinquency: delinqScore },
      history: history.reverse(),
      tip: total < 60 ? 'Dispare os agentes para melhorar seu score' : 'Seu negócio está saudável!'
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// ROI CALCULATOR
// ============================================
app.get('/api/roi/summary', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();

    // Aprovações do mês
    const approved = await db.all("SELECT a.*, c.mrr as customer_mrr FROM approvals a LEFT JOIN customers c ON a.customer_id=c.id WHERE a.status='approved' AND a.created_at >= ?", [since]);
    const emailsSent = await db.get('SELECT COUNT(*) as count FROM email_history WHERE user_id=? AND sent_at >= ?', [req.user.userId, since]);

    let retained = 0, upsellValue = 0, contractSavings = 0;
    for (const a of approved) {
      const mrr = Number(a.customer_mrr) || 0;
      if (a.agent_type === 'churn_prediction') retained += mrr * 6; // LTV de 6 meses
      if (a.agent_type === 'upsell_crosssell') { let d={}; try{d=JSON.parse(a.decision_data||'{}')}catch(e){} upsellValue += Number(d.estimated_value)||mrr*0.3; }
      if (a.agent_type === 'contract_renegotiation') { let d={}; try{d=JSON.parse(a.decision_data||'{}')}catch(e){} contractSavings += Number(d.savings)||0; }
    }

    const totalROI = retained + upsellValue + contractSavings;
    const plan = await db.get('SELECT plan FROM business_profiles WHERE user_id=?', [req.user.userId]);
    const planCosts = { starter: 49, growth: 149, enterprise: 499 };
    const planCost = planCosts[plan?.plan || 'starter'];
    const roiMultiplier = totalROI > 0 ? (totalROI / planCost).toFixed(1) : 0;

    // ROI events
    const events = await db.all('SELECT * FROM roi_events WHERE user_id=? AND recorded_at >= ? ORDER BY recorded_at DESC LIMIT 20', [req.user.userId, since]);

    res.json({
      total_roi: totalROI,
      retained_revenue: retained,
      upsell_value: upsellValue,
      contract_savings: contractSavings,
      plan_cost: planCost,
      roi_multiplier: roiMultiplier,
      emails_sent: emailsSent?.count || 0,
      decisions_made: approved.length,
      events
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// FORECAST 90 DIAS
// ============================================
app.get('/api/forecast', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
    const customers = await db.get('SELECT COUNT(*) as total, COALESCE(SUM(mrr),0) as total_mrr, COALESCE(AVG(engagement_score),0) as avg_eng FROM customers');
    const pipeline = await db.all("SELECT * FROM sales_pipeline WHERE user_id=? AND stage NOT IN ('won','lost')", [req.user.userId]);
    const goals = await db.all('SELECT * FROM business_goals WHERE user_id=?', [req.user.userId]);
    const highRisk = await db.get('SELECT COUNT(*) as count FROM customers WHERE engagement_score < 30');

    const mrr = Number(snap?.mrr || customers.total_mrr) || 0;
    const churnRate = Number(snap?.churn_rate) || 3;
    const growthRate = Number(snap?.growth_rate) || 5;
    const pipelineWinRate = 0.3;
    const pipelineValue = pipeline.reduce((s,p) => s + (p.deal_value||0) * pipelineWinRate * ((p.probability||30)/100), 0);

    // Projeção sem ação
    const mrrNoAction30 = mrr * (1 - churnRate/100) + (mrr * (growthRate/100) * 0.3);
    const mrrNoAction60 = mrrNoAction30 * (1 - churnRate/100) + (mrrNoAction30 * (growthRate/100) * 0.3);
    const mrrNoAction90 = mrrNoAction60 * (1 - churnRate/100) + (mrrNoAction60 * (growthRate/100) * 0.3);

    // Projeção com NeuralOps (reduz churn em 60%, aumenta conversão em 20%)
    const reducedChurn = churnRate * 0.4;
    const boostedGrowth = growthRate * 1.2;
    const mrrWithAI30 = mrr * (1 - reducedChurn/100) + (mrr * (boostedGrowth/100) * 0.3) + (pipelineValue * 0.33);
    const mrrWithAI60 = mrrWithAI30 * (1 - reducedChurn/100) + (mrrWithAI30 * (boostedGrowth/100) * 0.3) + (pipelineValue * 0.33);
    const mrrWithAI90 = mrrWithAI60 * (1 - reducedChurn/100) + (mrrWithAI60 * (boostedGrowth/100) * 0.3) + (pipelineValue * 0.34);

    const aiSummary = await callClaude(
      'Você é analista financeiro. Seja direto, 2 frases, em português.',
      `MRR atual: R$${mrr.toFixed(0)}, Churn: ${churnRate}%, Clientes em risco: ${highRisk?.count||0}, Pipeline: R$${pipelineValue.toFixed(0)}. Qual a perspectiva para 90 dias?`,
      100
    );

    res.json({
      current_mrr: mrr,
      scenarios: {
        no_action: { d30: Math.round(mrrNoAction30), d60: Math.round(mrrNoAction60), d90: Math.round(mrrNoAction90) },
        with_neuralops: { d30: Math.round(mrrWithAI30), d60: Math.round(mrrWithAI60), d90: Math.round(mrrWithAI90) }
      },
      potential_gain: Math.round(mrrWithAI90 - mrrNoAction90),
      high_risk_customers: highRisk?.count || 0,
      pipeline_value: Math.round(pipelineValue),
      insight: aiSummary.success ? aiSummary.text : 'Continue monitorando seus indicadores.',
      goals: goals.slice(0, 3)
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// NEURALOPS ASSISTANT (IA Proativa Diária)
// ============================================
app.get('/api/assistant/daily', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const cacheKey = `assistant_${req.user.userId}_${new Date().toDateString()}`;

    // Coleta dados do dia
    const [pending, highRisk, snap, customers] = await Promise.all([
      db.get("SELECT COUNT(*) as count FROM approvals WHERE status='pending'"),
      db.all('SELECT name, engagement_score, mrr FROM customers WHERE engagement_score < 25 ORDER BY mrr DESC LIMIT 3'),
      db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1'),
      db.get('SELECT COUNT(*) as total, COALESCE(SUM(mrr),0) as total_mrr FROM customers')
    ]);

    const profile = await db.get('SELECT * FROM business_profiles WHERE user_id=?', [req.user.userId]);
    const user = await db.get('SELECT name FROM users WHERE id=?', [req.user.userId]);
    const firstName = (user?.name || 'você').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    const contextMsg = `Usuário: ${firstName}, Negócio: ${profile?.segment || 'saas'}, MRR: R$${Math.round(snap?.mrr || customers.total_mrr || 0)}, Aprovações pendentes: ${pending?.count || 0}, Clientes em risco crítico: ${highRisk.map(c => c.name + '(' + c.engagement_score + '%)').join(', ') || 'nenhum'}`;

    const result = await callClaude(
      `Você é o assistente do NeuralOps. Gere uma mensagem proativa de ${greeting} para o usuário. Seja direto, informal e útil. Máximo 2 frases. Foque no mais urgente. Não use emojis no início.`,
      contextMsg, 120
    );

    const message = result.success ? result.text : `${greeting}, ${firstName}! Você tem ${pending?.count || 0} aprovações pendentes. Dispare os agentes para novas análises.`;

    const actions = [];
    if ((pending?.count || 0) > 0) actions.push({ label: `Ver ${pending.count} aprovações`, page: 'approvals', urgent: true });
    if (highRisk.length > 0) actions.push({ label: `${highRisk.length} clientes em risco`, page: 'agents', urgent: true });
    actions.push({ label: 'Ver Relatório', page: 'relatorios', urgent: false });

    res.json({ greeting, first_name: firstName, message, actions, high_risk: highRisk, pending_count: pending?.count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// BENCHMARK DO SETOR
// ============================================
app.get('/api/benchmark', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const profile = await db.get('SELECT segment FROM business_profiles WHERE user_id=?', [req.user.userId]);
    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
    const customers = await db.get('SELECT COUNT(*) as total, COALESCE(AVG(engagement_score),0) as avg_eng FROM customers');

    const segment = profile?.segment || 'saas';

    // Benchmarks por setor (dados de mercado brasileiro 2025)
    const BENCHMARKS = {
      saas:        { churn: 3.5, engagement: 65, growth: 8, nps: 42, avg_mrr_per_customer: 350 },
      ecommerce:   { churn: 15,  engagement: 45, growth: 12, nps: 38, avg_order: 180 },
      restaurante: { churn: 20,  engagement: 55, growth: 5,  nps: 50, avg_ticket: 95 },
      saude:       { churn: 8,   engagement: 70, growth: 6,  nps: 55, return_rate: 65 },
      agencia:     { churn: 12,  engagement: 60, growth: 10, nps: 44, utilization: 72 },
      varejo:      { churn: 18,  engagement: 40, growth: 7,  nps: 36, avg_ticket: 210 },
      servicos:    { churn: 10,  engagement: 58, growth: 8,  nps: 46, renewal_rate: 80 },
      imobiliaria: { churn: 6,   engagement: 62, growth: 5,  nps: 40, vacancy_rate: 8 },
    };

    const bench = BENCHMARKS[segment] || BENCHMARKS.saas;
    const userChurn = Number(snap?.churn_rate) || 0;
    const userEng = Number(customers.avg_eng) || 0;

    const churnStatus = userChurn < bench.churn ? 'better' : userChurn < bench.churn * 1.3 ? 'similar' : 'worse';
    const engStatus = userEng > bench.engagement * 1.1 ? 'better' : userEng > bench.engagement * 0.9 ? 'similar' : 'worse';

    const percentilChurn = userChurn === 0 ? 95 : Math.round(Math.max(5, Math.min(99, (1 - userChurn / (bench.churn * 2)) * 100)));
    const percentilEng = Math.round(Math.max(5, Math.min(99, (userEng / (bench.engagement * 1.5)) * 100)));

    res.json({
      segment, benchmark: bench,
      user: { churn: userChurn, engagement: userEng, customers: customers.total },
      comparison: { churn: churnStatus, engagement: engStatus },
      percentiles: { churn: percentilChurn, engagement: percentilEng },
      insights: [
        churnStatus === 'better' ? `✅ Seu churn de ${userChurn.toFixed(1)}% está ${(bench.churn - userChurn).toFixed(1)}pp abaixo da média do setor` : `⚠️ Seu churn está ${(userChurn - bench.churn).toFixed(1)}pp acima da média`,
        engStatus === 'better' ? `✅ Engajamento ${userEng.toFixed(0)}% acima da média de ${bench.engagement}%` : `⚠️ Engajamento abaixo da média do setor (${bench.engagement}%)`,
        `📊 Você está no top ${Math.min(percentilChurn, percentilEng)}% das empresas do setor`,
      ]
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// AUTOMAÇÕES / RÉGUA DE RELACIONAMENTO
// ============================================
app.get('/api/automations', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const rules = await db.all('SELECT * FROM automation_rules WHERE user_id=? ORDER BY created_at DESC', [req.user.userId]);
    res.json({ rules });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, trigger_type, trigger_value, trigger_days, action_type, channel, delay_hours } = req.body;
    if (!name || !trigger_type || !action_type) return res.status(400).json({ error: 'Campos obrigatórios faltando' });
    const r = await db.run('INSERT INTO automation_rules (user_id,name,trigger_type,trigger_value,trigger_days,action_type,channel,delay_hours) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.userId, name, trigger_type, trigger_value||0, trigger_days||0, action_type, channel||'email', delay_hours||0]);
    res.status(201).json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/automations/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    await db.run('UPDATE automation_rules SET is_active=COALESCE(?,is_active), name=COALESCE(?,name) WHERE id=? AND user_id=?',
      [req.body.is_active, req.body.name, req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/automations/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    await db.run('DELETE FROM automation_rules WHERE id=? AND user_id=?', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Marketplace de automações
app.get('/api/automations/marketplace', async (req, res) => {
  try {
    const db = await getDatabase();
    let templates = await db.all('SELECT * FROM automation_templates ORDER BY installs DESC');
    if (!templates.length) {
      // Seed com templates padrão
      const defaults = [
        ['Retenção 30 dias','Engaja clientes inativos há 30 dias','retention','all','engagement_drop',30,0,'send_retention_email','email'],
        ['Upsell Engajamento Alto','Proposta para clientes engajados >70%','upsell','all','engagement_high',70,0,'send_upsell_offer','email'],
        ['Cobrança D+7','Cobrança amigável 7 dias após vencimento','delinquency','all','payment_overdue',0,7,'send_payment_reminder','email'],
        ['Boas-vindas Automático','Email de boas-vindas para novos clientes','welcome','all','new_customer',0,0,'send_welcome_email','email'],
        ['Alerta Risco Alto','WhatsApp quando churn score crítico','retention','saas','churn_critical',90,0,'send_whatsapp_alert','whatsapp'],
        ['Cross-sell E-commerce','Sugere produtos após 2 compras','upsell','ecommerce','purchase_count',2,0,'send_crosssell_offer','email'],
        ['Reativação 60 dias','Reativa clientes sumidos há 60 dias','retention','all','engagement_drop',0,60,'send_reactivation_email','email'],
        ['Renovação Contrato','Lembra renovação 30 dias antes','contract','servicos','contract_expiry',0,30,'send_renewal_reminder','email'],
      ];
      for (const [name,desc,category,segment,trigger_type,trigger_value,trigger_days,action_type,channel] of defaults) {
        await db.run('INSERT INTO automation_templates (name,description,category,segment,trigger_type,trigger_value,trigger_days,action_type,installs,is_featured) VALUES (?,?,?,?,?,?,?,?,?,?)',
          [name, desc, category, segment, trigger_type, trigger_value, trigger_days, action_type, Math.floor(Math.random()*500)+50, Math.random()>0.5]);
      }
      templates = await db.all('SELECT * FROM automation_templates ORDER BY installs DESC');
    }
    res.json({ templates });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/automations/install/:templateId', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const tpl = await db.get('SELECT * FROM automation_templates WHERE id=?', [req.params.templateId]);
    if (!tpl) return res.status(404).json({ error: 'Template não encontrado' });
    const r = await db.run('INSERT INTO automation_rules (user_id,name,trigger_type,trigger_value,trigger_days,action_type,channel) VALUES (?,?,?,?,?,?,?)',
      [req.user.userId, tpl.name, tpl.trigger_type, tpl.trigger_value, tpl.trigger_days, tpl.action_type, 'email']);
    await db.run('UPDATE automation_templates SET installs=installs+1 WHERE id=?', [req.params.templateId]);
    res.json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// MULTI-EMPRESA
// ============================================
app.get('/api/companies', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const companies = await db.all('SELECT * FROM companies WHERE owner_user_id=? ORDER BY created_at DESC', [req.user.userId]);
    res.json({ companies });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/companies', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, segment, color } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const r = await db.run('INSERT INTO companies (owner_user_id,name,segment,color) VALUES (?,?,?,?)',
      [req.user.userId, name, segment||'saas', color||'#00d4ff']);
    res.status(201).json({ success: true, id: r.lastID });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/companies/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { name, segment, color, mrr, customer_count } = req.body;
    await db.run('UPDATE companies SET name=COALESCE(?,name), segment=COALESCE(?,segment), color=COALESCE(?,color), mrr=COALESCE(?,mrr), customer_count=COALESCE(?,customer_count), updated_at=NOW() WHERE id=? AND owner_user_id=?',
      [name, segment, color, mrr, customer_count, req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/companies/:id', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    await db.run('DELETE FROM companies WHERE id=? AND owner_user_id=?', [req.params.id, req.user.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// COACH FINANCEIRO IA
// ============================================
app.get('/api/coach/session', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const now = new Date();
    const session = await db.get('SELECT * FROM coach_sessions WHERE user_id=? AND month=? AND year=?',
      [req.user.userId, now.getMonth()+1, now.getFullYear()]);

    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
    const customers = await db.get('SELECT COUNT(*) as total, COALESCE(SUM(mrr),0) as total_mrr FROM customers');
    const approvedCount = await db.get("SELECT COUNT(*) as count FROM approvals WHERE status='approved' AND created_at >= date_trunc('month', CURRENT_DATE)");
    const goals = await db.all('SELECT * FROM business_goals WHERE user_id=?', [req.user.userId]);

    const questions = [
      { id: 'goal_mrr', text: 'Você atingiu sua meta de MRR este mês?', type: 'yesno' },
      { id: 'main_win', text: 'Qual foi sua maior conquista este mês?', type: 'text' },
      { id: 'main_challenge', text: 'Qual foi seu maior obstáculo?', type: 'text' },
      { id: 'lost_customers', text: 'Perdeu algum cliente importante? Por quê?', type: 'text' },
      { id: 'next_focus', text: 'Qual será seu foco principal no próximo mês?', type: 'text' },
    ];

    res.json({
      session: session || null,
      questions,
      context: { mrr: snap?.mrr || customers.total_mrr || 0, customers: customers.total, decisions: approvedCount?.count || 0, goals: goals.length }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/coach/session', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const { answers } = req.body;
    const now = new Date();

    const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
    const customers = await db.get('SELECT COUNT(*) as total, COALESCE(SUM(mrr),0) as total_mrr FROM customers');

    const aiResult = await callClaude(
      'Você é coach de negócios experiente. Gere um plano de ação para o próximo mês em 3 itens práticos e objetivos. Responda em português.',
      `MRR: R$${Math.round(snap?.mrr || customers.total_mrr || 0)}, Clientes: ${customers.total}. Respostas do empresário: ${JSON.stringify(answers)}`,
      300
    );

    const summaryResult = await callClaude(
      'Analista de negócios. Gere um resumo executivo do mês em 2 frases. Seja positivo e construtivo.',
      `Empresa com MRR R$${Math.round(snap?.mrr || 0)}, respostas: ${JSON.stringify(answers)}`,
      100
    );

    const existing = await db.get('SELECT id FROM coach_sessions WHERE user_id=? AND month=? AND year=?',
      [req.user.userId, now.getMonth()+1, now.getFullYear()]);

    if (existing) {
      await db.run('UPDATE coach_sessions SET answers=?, action_plan=?, ai_summary=? WHERE id=?',
        [JSON.stringify(answers), aiResult.success ? aiResult.text : '', summaryResult.success ? summaryResult.text : '', existing.id]);
    } else {
      await db.run('INSERT INTO coach_sessions (user_id,month,year,answers,action_plan,ai_summary) VALUES (?,?,?,?,?,?)',
        [req.user.userId, now.getMonth()+1, now.getFullYear(), JSON.stringify(answers), aiResult.success ? aiResult.text : '', summaryResult.success ? summaryResult.text : '']);
    }

    res.json({ success: true, action_plan: aiResult.success ? aiResult.text : 'Continue focando em retenção e crescimento.', summary: summaryResult.success ? summaryResult.text : '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// CERTIFICADO DE SAÚDE EMPRESARIAL
// ============================================
app.get('/api/certificate', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const [snap, customers, approvals, health, profile, user] = await Promise.all([
      db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1'),
      db.get('SELECT COUNT(*) as total, COALESCE(SUM(mrr),0) as total_mrr, COALESCE(AVG(engagement_score),0) as avg_eng FROM customers'),
      db.get("SELECT COUNT(*) as count FROM approvals WHERE status='approved'"),
      db.get('SELECT score, level FROM health_scores WHERE user_id=? ORDER BY recorded_at DESC LIMIT 1', [req.user.userId]),
      db.get('SELECT * FROM business_profiles WHERE user_id=?', [req.user.userId]),
      db.get('SELECT name, email, created_at FROM users WHERE id=?', [req.user.userId])
    ]);

    res.json({
      company: { name: profile?.company_name || user?.name || 'Empresa', segment: profile?.segment || 'saas' },
      user: { name: user?.name, email: user?.email, member_since: user?.created_at },
      metrics: {
        mrr: Math.round(snap?.mrr || customers.total_mrr || 0),
        arr: Math.round((snap?.mrr || customers.total_mrr || 0) * 12),
        customers: customers.total,
        avg_engagement: Math.round(customers.avg_eng),
        churn_rate: Number(snap?.churn_rate || 0).toFixed(1),
        decisions_approved: approvals?.count || 0,
      },
      health_score: health?.score || 0,
      health_level: health?.level || 'Regular',
      issued_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 30*86400000).toISOString(),
      certificate_id: `NO-${Date.now().toString(36).toUpperCase()}`
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================
// WEEKLY REPORT CRON
// ============================================
app.get('/api/cron/weekly-report', async (req, res) => {
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = await getDatabase();
    const users = await db.all('SELECT u.id, u.name, u.email FROM users u LEFT JOIN user_settings s ON u.id=s.user_id WHERE s.notify_email != false AND u.is_active=1 LIMIT 100');
    let sent = 0;
    for (const user of users) {
      try {
        const snap = await db.get('SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1');
        const pending = await db.get("SELECT COUNT(*) as count FROM approvals WHERE status='pending'");
        const health = await db.get('SELECT score FROM health_scores WHERE user_id=? ORDER BY recorded_at DESC LIMIT 1', [user.id]);
        const score = health?.score || 0;
        const scoreColor = score >= 80 ? '#00ff88' : score >= 60 ? '#00d4ff' : score >= 40 ? '#ff6b35' : '#ff4466';
        if (process.env.RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: 'NeuralOps <reports@neuralops.com.br>',
              to: [user.email],
              subject: `📊 Relatório Semanal — NeuralOps`,
              html: `<div style="max-width:580px;margin:0 auto;background:#111827;border-radius:8px;overflow:hidden;font-family:Arial,sans-serif;">
                <div style="background:#05060a;padding:24px 32px;border-bottom:1px solid #1e2d42;">
                  <h1 style="color:#f0f8ff;font-size:20px;margin:0;">N<span style="color:#00d4ff;">euralOps</span> · Relatório Semanal</h1>
                </div>
                <div style="padding:24px 32px;">
                  <p style="color:#9ab5cc;margin:0 0 20px;">Olá, ${user.name?.split(' ')[0] || 'cliente'}! Aqui está o resumo da semana.</p>
                  <div style="background:#0d1420;border-radius:6px;padding:20px;margin-bottom:20px;text-align:center;">
                    <div style="font-size:11px;color:#6b8aaa;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">HEALTH SCORE</div>
                    <div style="font-size:48px;font-weight:800;color:${scoreColor};">${score}</div>
                    <div style="font-size:13px;color:#9ab5cc;">de 100</div>
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
                    <div style="background:#0d1420;border-radius:4px;padding:14px;"><div style="font-size:10px;color:#6b8aaa;text-transform:uppercase;">MRR</div><div style="font-size:22px;font-weight:700;color:#00d4ff;">R$${Math.round(snap?.mrr||0).toLocaleString('pt-BR')}</div></div>
                    <div style="background:#0d1420;border-radius:4px;padding:14px;"><div style="font-size:10px;color:#6b8aaa;text-transform:uppercase;">Aprovações Pendentes</div><div style="font-size:22px;font-weight:700;color:#ff6b35;">${pending?.count||0}</div></div>
                  </div>
                  <a href="https://neuralops-sage.vercel.app/dashboard" style="display:block;background:#00d4ff;color:#05060a;text-align:center;padding:14px;border-radius:4px;font-weight:700;font-size:14px;text-decoration:none;">VER DASHBOARD →</a>
                </div>
              </div>`
            })
          });
          sent++;
        }
      } catch(e) {}
    }
    res.json({ success: true, sent });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rotas das novas páginas
app.get('/coach', (req, res) => res.sendFile(path.join(PUBLIC, 'coach.html')));
app.get('/automacoes', (req, res) => res.sendFile(path.join(PUBLIC, 'automacoes.html')));
app.get('/multiempresa', (req, res) => res.sendFile(path.join(PUBLIC, 'multiempresa.html')));
app.get('/certificado', (req, res) => res.sendFile(path.join(PUBLIC, 'certificado.html')));

// ============================================
// 404 HANDLER
// ============================================
app.use(errorHandler);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: `Endpoint não encontrado: ${req.method} ${req.path}` });
  }
  res.redirect('/');
});

// ============================================
// START SERVER
// ============================================
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🤖 NeuralOps Backend Started — Port: ${PORT}`);
    if (!ANTHROPIC_API_KEY) console.warn('⚠️  Adicione ANTHROPIC_API_KEY para ativar IA real!');
    if (!process.env.JWT_SECRET) console.warn('⚠️  Adicione JWT_SECRET para segurança em produção!');
  });
  process.on('SIGTERM', async () => { process.exit(0); });
}

export default app;

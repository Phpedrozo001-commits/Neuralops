import express from 'express';
import dotenv from 'dotenv';
import { initializeDatabase } from './db.js';
import scheduler from './scheduler.js';
import approvalEngine from './approval.js';
import { authMiddleware, requireRole, loginUser, registerUser, generateToken } from './middleware/auth.js';
import { securityHeaders, corsConfig, errorHandler, requestLogger, generalLimiter, authLimiter, approvalLimiter, agentLimiter } from './middleware/security.js';
import { validateRequest, customerValidation, contractValidation, approvalValidation, loginValidation, registerValidation, chatValidation } from './middleware/validation.js';
import { logAudit, getAuditLogs } from './utils/audit.js';

dotenv.config();

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
        model: 'claude-3-5-sonnet-20241022',
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

let db;
(async () => {
  db = await initializeDatabase();
  await scheduler.start();
})();

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
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(new URL('./public/index.html', import.meta.url).pathname);
});
app.get('/login', (req, res) => {
  res.sendFile(new URL('./public/auth.html', import.meta.url).pathname);
});
app.get('/register', (req, res) => {
  res.sendFile(new URL('./public/auth.html', import.meta.url).pathname);
});
app.get('/dashboard', (req, res) => {
  res.sendFile(new URL('./public/dashboard.html', import.meta.url).pathname);
});

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: ANTHROPIC_API_KEY ? 'claude-connected' : 'not-configured',
    scheduler: scheduler.getStatus()
  });
});

// ============================================
// DASHBOARD OVERVIEW
// ============================================
app.get('/api/dashboard/overview', authMiddleware, async (req, res) => {
  try {
    const latestSnapshot = await db.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
    const pendingApprovals = await db.get(`SELECT COUNT(*) as count FROM approvals WHERE status = 'pending' AND expires_at > datetime('now')`);
    const recentChurn = await db.get(`SELECT COUNT(*) as count FROM churn_predictions WHERE risk_level IN ('high', 'critical') AND created_at > datetime('now', '-7 days')`);
    const recentUpsell = await db.get(`SELECT COUNT(*) as count FROM upsell_opportunities WHERE status = 'pending' AND created_at > datetime('now', '-7 days')`);
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
// CHURN
// ============================================
app.get('/api/churn/risks', authMiddleware, async (req, res) => {
  try {
    const risks = await db.all(`
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
    const result = await scheduler.triggerAgent('churn_prediction');
    await logAudit(req.user.userId, 'TRIGGER_AGENT', 'churn_prediction', null, null, result, req);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UPSELL
// ============================================
app.get('/api/upsell/opportunities', authMiddleware, async (req, res) => {
  try {
    const opportunities = await db.all(`
      SELECT c.id, c.name, c.email, c.mrr, uo.opportunity_type, uo.estimated_value, uo.confidence_score, uo.status
      FROM upsell_opportunities uo JOIN customers c ON uo.customer_id = c.id
      WHERE uo.status = 'pending' ORDER BY uo.estimated_value DESC LIMIT 50
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
// FINANCIAL
// ============================================
app.get('/api/financial/snapshot', authMiddleware, async (req, res) => {
  try {
    const snapshot = await db.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
    res.json(snapshot);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/financial/history', authMiddleware, async (req, res) => {
  try {
    const history = await db.all(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 100`);
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
// CONTRACTS
// ============================================
app.get('/api/contracts/overpriced', authMiddleware, async (req, res) => {
  try {
    const contracts = await db.all(`SELECT * FROM contracts WHERE deviation_percent > 10 AND status = 'active' ORDER BY deviation_percent DESC`);
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
    const logs = await db.all(`SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 100`);
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
    const { name, email, mrr, engagement_score } = req.body;
    const result = await db.run(`INSERT INTO customers (name, email, mrr, engagement_score) VALUES (?, ?, ?, ?)`, [name, email, mrr || 0, engagement_score || 50]);
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

app.post('/api/contracts', authMiddleware, requireRole('admin', 'manager'), contractValidation, validateRequest, async (req, res) => {
  try {
    const { vendor_name, annual_cost, market_rate } = req.body;
    const result = await db.run(`INSERT INTO contracts (vendor_name, annual_cost, market_rate) VALUES (?, ?, ?)`, [vendor_name, annual_cost, market_rate]);
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
// CHAT COM IA REAL (Claude AI)
// ============================================
app.post('/api/chat', authMiddleware, chatValidation, validateRequest, async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    // Buscar dados reais do banco para contexto
    let contextData = {};
    try {
      const snapshot = await db.get(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 1`);
      const churnCount = await db.get(`SELECT COUNT(*) as count FROM churn_predictions WHERE risk_level IN ('high','critical')`);
      const upsellCount = await db.get(`SELECT COUNT(*) as count FROM upsell_opportunities WHERE status='pending'`);
      const customerCount = await db.get(`SELECT COUNT(*) as count, ROUND(AVG(mrr),2) as avg_mrr, SUM(mrr) as total_mrr FROM customers`);
      const pendingApprovals = await db.get(`SELECT COUNT(*) as count FROM approvals WHERE status='pending'`);
      contextData = { snapshot, churnCount, upsellCount, customerCount, pendingApprovals };
    } catch (e) {}

    const systemPrompt = `Você é o NeuralOps AI — assistente de inteligência de negócios especializado em SaaS.
Você analisa dados reais da empresa e fornece insights precisos e acionáveis sobre:
- Churn prediction e prevenção
- Upsell e cross-sell opportunities  
- Projeções financeiras (MRR, ARR, runway, burn rate)
- Análise e renegociação de contratos
- Decisões estratégicas

DADOS ATUAIS DO SISTEMA:
${JSON.stringify(contextData, null, 2)}

REGRAS:
- Responda SEMPRE em português brasileiro
- Seja direto, profissional e específico com números reais
- Use APENAS os dados fornecidos acima — nunca invente dados
- Forneça recomendações concretas e acionáveis
- Se os dados estiverem vazios, oriente como preencher o sistema
- Respostas concisas mas completas (máx 250 palavras)
- Use formatação clara com bullet points quando necessário`;

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
    const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const predictions = await db.all(`SELECT * FROM churn_predictions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`, [req.params.id]);
    const upsell = await db.all(`SELECT * FROM upsell_opportunities WHERE customer_id = ? ORDER BY created_at DESC LIMIT 5`, [req.params.id]);

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
    const snapshots = await db.all(`SELECT * FROM financial_snapshots ORDER BY created_at DESC LIMIT 12`);
    const customers = await db.get(`SELECT COUNT(*) as count, ROUND(AVG(mrr),2) as avg_mrr, SUM(mrr) as total_mrr FROM customers`);

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
║   AI: ${ANTHROPIC_API_KEY ? '✅ Claude Connected    ' : '⚠️  API Key Missing    '}║
║   Database: SQLite                     ║
║   Scheduler: Active                    ║
║   Security: Enabled                    ║
╚════════════════════════════════════════╝
  `);
  if (!ANTHROPIC_API_KEY) console.warn('\n⚠️  Adicione ANTHROPIC_API_KEY nas variáveis do Railway para ativar IA real!\n');
  if (!process.env.JWT_SECRET) console.warn('⚠️  Adicione JWT_SECRET nas variáveis do Railway para segurança em produção!\n');
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await scheduler.stop();
  process.exit(0);
});

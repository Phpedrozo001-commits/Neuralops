// routes/segments.js — Novos endpoints NeuralOps
import { getDatabase } from '../db.js';

const PLANS = {
  starter: { name:'Starter', price:49, customers_limit:100, emails_limit:200, agents:3 },
  growth:  { name:'Growth',  price:149, customers_limit:500, emails_limit:1000, agents:6 },
  enterprise: { name:'Enterprise', price:499, customers_limit:99999, emails_limit:99999, agents:99 }
};

export function registerSegmentRoutes(app, { authMiddleware, agentLimiter, callClaude }) {

  app.get('/api/approvals/history', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      const history = await db.all("SELECT a.*, c.name as customer_name FROM approvals a LEFT JOIN customers c ON a.customer_id=c.id WHERE a.status IN ('approved','rejected') ORDER BY a.created_at DESC LIMIT 100");
      res.json({ history });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/business/profile', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      let p = await db.get('SELECT * FROM business_profiles WHERE user_id=?', [req.user.userId]);
      if (!p) { await db.run('INSERT INTO business_profiles (user_id) VALUES (?)', [req.user.userId]); p = await db.get('SELECT * FROM business_profiles WHERE user_id=?', [req.user.userId]); }
      res.json({ profile: p });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/business/profile', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      const { segment, company_size, monthly_revenue, customer_count, main_challenge, onboarding_completed, onboarding_step } = req.body;
      const ex = await db.get('SELECT id FROM business_profiles WHERE user_id=?', [req.user.userId]);
      if (ex) {
        await db.run('UPDATE business_profiles SET segment=COALESCE(?,segment), company_size=COALESCE(?,company_size), monthly_revenue=COALESCE(?,monthly_revenue), customer_count=COALESCE(?,customer_count), main_challenge=COALESCE(?,main_challenge), onboarding_completed=COALESCE(?,onboarding_completed), onboarding_step=COALESCE(?,onboarding_step), updated_at=NOW() WHERE user_id=?',
          [segment, company_size, monthly_revenue, customer_count, main_challenge, onboarding_completed, onboarding_step, req.user.userId]);
      } else {
        await db.run('INSERT INTO business_profiles (user_id,segment,company_size,monthly_revenue,customer_count,main_challenge,onboarding_completed,onboarding_step) VALUES (?,?,?,?,?,?,?,?)',
          [req.user.userId, segment||'saas', company_size||'micro', monthly_revenue||0, customer_count||0, main_challenge, onboarding_completed||false, onboarding_step||0]);
      }
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/sales/pipeline', authMiddleware, async (req, res) => {
    try { const db = await getDatabase(); const leads = await db.all('SELECT * FROM sales_pipeline WHERE user_id=? ORDER BY deal_value DESC', [req.user.userId]); res.json({ leads }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/sales/pipeline', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      const { lead_name, lead_email, lead_phone, company, deal_value, stage, probability, notes, expected_close } = req.body;
      if (!lead_name) return res.status(400).json({ error: 'Nome obrigatório' });
      const r = await db.run('INSERT INTO sales_pipeline (user_id,lead_name,lead_email,lead_phone,company,deal_value,stage,probability,notes,expected_close) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [req.user.userId, lead_name, lead_email, lead_phone, company, deal_value||0, stage||'prospect', probability||30, notes, expected_close]);
      res.status(201).json({ success: true, id: r.lastID });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.put('/api/sales/pipeline/:id', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      await db.run('UPDATE sales_pipeline SET stage=COALESCE(?,stage), probability=COALESCE(?,probability), notes=COALESCE(?,notes), deal_value=COALESCE(?,deal_value), updated_at=NOW() WHERE id=? AND user_id=?',
        [req.body.stage, req.body.probability, req.body.notes, req.body.deal_value, req.params.id, req.user.userId]);
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

  app.get('/api/delinquency/records', authMiddleware, async (req, res) => {
    try { const db = await getDatabase(); const records = await db.all('SELECT d.*, c.name as customer_name, c.email as customer_email FROM delinquency_records d LEFT JOIN customers c ON d.customer_id=c.id WHERE d.user_id=? ORDER BY d.days_overdue DESC', [req.user.userId]); res.json({ records }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/delinquency/records', authMiddleware, async (req, res) => {
    try {
      const db = await getDatabase();
      const { customer_id, amount, due_date, notes } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ error: 'Valor obrigatório' });
      const dueDate = due_date ? new Date(due_date) : new Date();
      const days = Math.max(0, Math.floor((Date.now() - dueDate.getTime()) / 86400000));
      const r = await db.run('INSERT INTO delinquency_records (customer_id,user_id,amount,due_date,days_overdue,notes) VALUES (?,?,?,?,?,?)', [customer_id||null, req.user.userId, amount, dueDate.toISOString(), days, notes]);
      res.status(201).json({ success:true, id:r.lastID });
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
          if (!ex) { await db.run("INSERT INTO approvals (agent_type,action_type,customer_id,decision_data,confidence_score,status,details) VALUES (?,?,?,?,?,?,?)", ['delinquency','payment_followup',c.id,JSON.stringify({customer_name:c.name,amount:c.mrr}),0.85,'pending',`${c.name} — R$${c.mrr}/mês — Eng: ${c.engagement_score}%`]); decisions++; }
        } catch(err) {}
      }
      res.json({ success:true, result:{ decisions_made:decisions, customers_analyzed:customers.length } });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/templates', authMiddleware, async (req, res) => {
    try { const db = await getDatabase(); const templates = await db.all('SELECT * FROM email_templates WHERE user_id=? ORDER BY usage_count DESC', [req.user.userId]); res.json({ templates }); }
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
      const result = await callClaude(`Especialista em copywriting. Tom: ${tone||'profissional'}. Responda SOMENTE JSON: {"subject":"...","body":"..."}`, `Email de ${catNames[category]||category} para ${segment||'negócios'}. Contexto: ${context||''}. Use {{nome}}.`, 400);
      if (result.success) {
        try { return res.json({ success:true, template:JSON.parse(result.text.replace(/```json|```/g,'').trim()) }); } catch(e) { return res.json({ success:true, template:{ subject:'Template Gerado', body:result.text } }); }
      }
      res.status(500).json({ error:'Erro ao gerar template' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

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
    try { const db = await getDatabase(); const history = await db.all('SELECT * FROM report_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20', [req.user.userId]); res.json({ history }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

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
}

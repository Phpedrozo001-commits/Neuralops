// seeds/demo.js
// Popula o banco com dados demo realistas
// Execute: node seeds/demo.js

import { initializeDatabase, getDatabase } from '../db.js';

const DEMO_CUSTOMERS = [
  // Clientes saudáveis (baixo risco)
  { name: 'TechFlow Solutions', email: 'contact@techflow.com', mrr: 890, engagement_score: 88, last_login: daysAgo(1) },
  { name: 'DataSync Pro', email: 'hello@datasync.io', mrr: 450, engagement_score: 82, last_login: daysAgo(2) },
  { name: 'CloudBase Inc', email: 'team@cloudbase.com', mrr: 1200, engagement_score: 91, last_login: daysAgo(0) },
  { name: 'GrowthHQ', email: 'info@growthhq.com', mrr: 320, engagement_score: 76, last_login: daysAgo(3) },
  { name: 'Nexus Digital', email: 'ops@nexusdigital.com', mrr: 680, engagement_score: 85, last_login: daysAgo(1) },

  // Clientes em risco médio
  { name: 'Startup Labs BR', email: 'admin@startuplabs.com.br', mrr: 210, engagement_score: 45, last_login: daysAgo(18) },
  { name: 'E-Commerce Plus', email: 'suporte@ecommerceplus.com', mrr: 380, engagement_score: 38, last_login: daysAgo(22) },
  { name: 'Analytics Hub', email: 'contact@analyticshub.io', mrr: 150, engagement_score: 42, last_login: daysAgo(20) },

  // Clientes em alto risco (crítico)
  { name: 'RetailMax', email: 'cto@retailmax.com.br', mrr: 560, engagement_score: 18, last_login: daysAgo(45) },
  { name: 'FinanceFlow', email: 'admin@financeflow.io', mrr: 290, engagement_score: 22, last_login: daysAgo(38) },
  { name: 'LogiTrack', email: 'ops@logitrack.com', mrr: 180, engagement_score: 15, last_login: daysAgo(55) },

  // Clientes nunca fizeram login (risco)
  { name: 'NewBiz Corp', email: 'hello@newbiz.com', mrr: 99, engagement_score: 10, last_login: null },
  { name: 'QuickStart SA', email: 'team@quickstart.com.br', mrr: 149, engagement_score: 12, last_login: null },

  // Clientes com alto upsell potential
  { name: 'ScaleUp Technologies', email: 'growth@scaleup.tech', mrr: 750, engagement_score: 94, last_login: daysAgo(0) },
  { name: 'Innovate Corp', email: 'ceo@innovatecorp.com', mrr: 920, engagement_score: 89, last_login: daysAgo(1) },
  { name: 'PrimeSaaS', email: 'info@primesaas.com', mrr: 480, engagement_score: 87, last_login: daysAgo(2) },
];

const DEMO_CONTRACTS = [
  // Contratos overpriced (boas oportunidades de renegociação)
  {
    vendor_name: 'AWS Enterprise Support',
    annual_cost: 84000,
    market_rate: 60000,
    renewal_date: daysFromNow(90),
    status: 'active'
  },
  {
    vendor_name: 'Salesforce CRM',
    annual_cost: 48000,
    market_rate: 36000,
    renewal_date: daysFromNow(120),
    status: 'active'
  },
  {
    vendor_name: 'Datadog Monitoring',
    annual_cost: 24000,
    market_rate: 18000,
    renewal_date: daysFromNow(60),
    status: 'active'
  },
  // Contratos com preço justo
  {
    vendor_name: 'GitHub Enterprise',
    annual_cost: 19200,
    market_rate: 18000,
    renewal_date: daysFromNow(180),
    status: 'active'
  },
  {
    vendor_name: 'Slack Business+',
    annual_cost: 12000,
    market_rate: 11520,
    renewal_date: daysFromNow(240),
    status: 'active'
  },
];

const DEMO_FINANCIAL_SNAPSHOTS = [
  // Histórico de 3 meses para calcular crescimento real
  { mrr: 4200, arr: 50400, runway_months: 18, burn_rate: 15000, growth_rate: 0, churn_rate: 3.2, cash_balance: 270000, months_ago: 3 },
  { mrr: 5800, arr: 69600, runway_months: 20, burn_rate: 15000, growth_rate: 7.2, churn_rate: 2.8, cash_balance: 285000, months_ago: 2 },
  { mrr: 6950, arr: 83400, runway_months: 22, burn_rate: 15000, growth_rate: 7.8, churn_rate: 2.4, cash_balance: 295000, months_ago: 1 },
];

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

async function seedDatabase() {
  console.log('🌱 Iniciando seed do banco de dados...\n');

  const db = await initializeDatabase();

  // Limpa dados existentes (mantém usuários)
  await db.run(`DELETE FROM churn_predictions`);
  await db.run(`DELETE FROM upsell_opportunities`);
  await db.run(`DELETE FROM approvals`);
  await db.run(`DELETE FROM activity_logs`);
  await db.run(`DELETE FROM agent_executions`);
  await db.run(`DELETE FROM financial_snapshots`);
  await db.run(`DELETE FROM contracts`);
  await db.run(`DELETE FROM customers`);
  console.log('✓ Dados anteriores removidos\n');

  // Insere clientes
  console.log('👥 Inserindo clientes demo...');
  for (const customer of DEMO_CUSTOMERS) {
    await db.run(
      `INSERT INTO customers (name, email, mrr, engagement_score, last_login) VALUES (?, ?, ?, ?, ?)`,
      [customer.name, customer.email, customer.mrr, customer.engagement_score, customer.last_login]
    );
  }
  const totalMRR = DEMO_CUSTOMERS.reduce((sum, c) => sum + c.mrr, 0);
  console.log(`✓ ${DEMO_CUSTOMERS.length} clientes inseridos`);
  console.log(`  MRR total: $${totalMRR.toLocaleString()}/mês\n`);

  // Insere contratos
  console.log('📄 Inserindo contratos demo...');
  for (const contract of DEMO_CONTRACTS) {
    const deviation = contract.market_rate > 0 
      ? ((contract.annual_cost - contract.market_rate) / contract.market_rate * 100)
      : 0;
    await db.run(
      `INSERT INTO contracts (vendor_name, annual_cost, market_rate, deviation_percent, renewal_date, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [contract.vendor_name, contract.annual_cost, contract.market_rate, parseFloat(deviation.toFixed(2)), contract.renewal_date, contract.status]
    );
  }
  const overpricedContracts = DEMO_CONTRACTS.filter(c => c.annual_cost > c.market_rate * 1.1);
  const totalSavings = overpricedContracts.reduce((sum, c) => sum + (c.annual_cost - c.market_rate), 0);
  console.log(`✓ ${DEMO_CONTRACTS.length} contratos inseridos`);
  console.log(`  ${overpricedContracts.length} overpriced — economia potencial: $${totalSavings.toLocaleString()}/ano\n`);

  // Insere histórico financeiro
  console.log('💰 Inserindo histórico financeiro...');
  for (const snap of DEMO_FINANCIAL_SNAPSHOTS) {
    const date = new Date();
    date.setMonth(date.getMonth() - snap.months_ago);
    await db.run(
      `INSERT INTO financial_snapshots (mrr, arr, runway_months, burn_rate, growth_rate, churn_rate, cash_balance, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [snap.mrr, snap.arr, snap.runway_months, snap.burn_rate, snap.growth_rate, snap.churn_rate, snap.cash_balance, date.toISOString()]
    );
  }
  console.log(`✓ ${DEMO_FINANCIAL_SNAPSHOTS.length} snapshots financeiros inseridos\n`);

  // Resumo
  const currentMRR = DEMO_CUSTOMERS.reduce((sum, c) => sum + c.mrr, 0);
  const highRisk = DEMO_CUSTOMERS.filter(c => c.engagement_score < 30);
  const upsellReady = DEMO_CUSTOMERS.filter(c => c.engagement_score >= 75 && c.mrr >= 200);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SEED CONCLUÍDO COM SUCESSO!\n');
  console.log('📊 RESUMO DO BANCO:');
  console.log(`   Clientes: ${DEMO_CUSTOMERS.length}`);
  console.log(`   MRR total: $${currentMRR.toLocaleString()}/mês ($${(currentMRR * 12).toLocaleString()}/ano)`);
  console.log(`   Em alto risco de churn: ${highRisk.length}`);
  console.log(`   Prontos para upsell: ${upsellReady.length}`);
  console.log(`   Contratos para renegociar: ${overpricedContracts.length}`);
  console.log(`   Economia potencial nos contratos: $${totalSavings.toLocaleString()}/ano`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n🚀 Agora dispare os agentes no dashboard para ver a IA em ação!');

  process.exit(0);
}

seedDatabase().catch(err => {
  console.error('❌ Erro no seed:', err);
  process.exit(1);
});

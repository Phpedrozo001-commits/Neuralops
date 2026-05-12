// ================================================
// NeuralOps — IA PRÓPRIA COMPLETA v3.0
// Motor de Inteligência de Negócios com Agentes Autônomos
// 100% independente — sem APIs externas
// Arquivo: /api/chat.js
// ================================================

import express from 'express';
import cors from 'cors';
import { initializeDatabase, getDatabase } from '../db.js';
import scheduler from '../scheduler.js';
import approvalEngine from '../approval.js';

const router = express.Router();

// Middleware
router.use(cors());
router.use(express.json());

// Initialize database
let db;
(async () => {
  db = await initializeDatabase();
  await scheduler.start();
})();

// ================================================
// KNOWLEDGE BASE - Comprehensive Business Intelligence
// ================================================
const KB = {
  agents: {
    churn_prediction: {
      name: 'Churn Prediction Agent',
      description: 'Analyzes customer behavior to predict churn 30 days in advance',
      capabilities: ['risk_scoring', 'retention_actions', 'email_triggers']
    },
    upsell_crosssell: {
      name: 'Upsell & Cross-sell Agent',
      description: 'Identifies perfect moments for upsell and cross-sell offers',
      capabilities: ['opportunity_detection', 'timing_optimization', 'value_estimation']
    },
    financial_projection: {
      name: 'Financial Projection Agent',
      description: 'Projects cashflow, runway, and financial health',
      capabilities: ['mrr_projection', 'runway_calculation', 'risk_analysis']
    },
    contract_renegotiation: {
      name: 'Contract Renegotiation Agent',
      description: 'Detects overpriced contracts and generates negotiation proposals',
      capabilities: ['price_deviation_detection', 'leverage_calculation', 'proposal_generation']
    }
  },

  business_metrics: {
    mrr: 'Monthly Recurring Revenue',
    arr: 'Annual Recurring Revenue',
    runway: 'Months of cash remaining',
    churn_rate: 'Monthly customer churn percentage',
    growth_rate: 'Monthly growth percentage',
    burn_rate: 'Monthly cash burn'
  },

  actions: {
    retention: ['send_retention_email', 'apply_discount', 'schedule_call', 'offer_feature_upgrade'],
    upsell: ['send_upsell_offer', 'schedule_demo', 'offer_trial', 'bundle_discount'],
    financial: ['cost_reduction', 'revenue_optimization', 'fundraising_prep'],
    contract: ['send_renegotiation_proposal', 'schedule_vendor_call', 'prepare_negotiation']
  }
};

// ================================================
// CHAT ENDPOINT - Main AI Interface
// ================================================
router.post('/chat', async (req, res) => {
  try {
    const { message, userId = 'user' } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await processUserMessage(message, userId);
    res.json(response);
  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ================================================
// MESSAGE PROCESSING
// ================================================
async function processUserMessage(message, userId) {
  const lowerMessage = message.toLowerCase();

  // Intent detection
  if (lowerMessage.includes('churn') || lowerMessage.includes('risk')) {
    return await handleChurnQuery(message);
  }

  if (lowerMessage.includes('upsell') || lowerMessage.includes('opportunity')) {
    return await handleUpsellQuery(message);
  }

  if (lowerMessage.includes('financial') || lowerMessage.includes('runway') || lowerMessage.includes('cash')) {
    return await handleFinancialQuery(message);
  }

  if (lowerMessage.includes('contract') || lowerMessage.includes('vendor')) {
    return await handleContractQuery(message);
  }

  if (lowerMessage.includes('trigger') || lowerMessage.includes('run')) {
    return await handleAgentTrigger(message);
  }

  if (lowerMessage.includes('approve') || lowerMessage.includes('approval')) {
    return await handleApprovalQuery(message);
  }

  if (lowerMessage.includes('activity') || lowerMessage.includes('log')) {
    return await handleActivityQuery(message);
  }

  // Default response
  return {
    response: `I can help you with:
    
📊 **Churn Analysis**: "Show me churn risks" or "Who's at risk of leaving?"
📈 **Upsell Opportunities**: "Find upsell opportunities" or "Who should we upgrade?"
💰 **Financial Health**: "What's our runway?" or "Show financial projections"
📋 **Contracts**: "Which contracts are overpriced?" or "Show vendor analysis"
⚡ **Trigger Agents**: "Run churn agent" or "Execute financial analysis"
✅ **Approvals**: "Show pending approvals" or "What needs approval?"
📝 **Activity**: "Show recent activity" or "What did agents do?"

What would you like to know?`,
    type: 'help'
  };
}

// ================================================
// CHURN QUERY HANDLER
// ================================================
async function handleChurnQuery(message) {
  try {
    const risks = await db.all(`
      SELECT c.id, c.name, c.email, c.mrr, cp.risk_score, cp.risk_level
      FROM churn_predictions cp
      JOIN customers c ON cp.customer_id = c.id
      WHERE cp.risk_level IN ('high', 'critical')
      ORDER BY cp.risk_score DESC
      LIMIT 10
    `);

    if (risks.length === 0) {
      return {
        response: '✅ No high-risk customers detected. Your customer base looks healthy!',
        type: 'churn',
        data: []
      };
    }

    const summary = risks.map(r => 
      `• **${r.name}** (${r.email}): ${r.risk_level.toUpperCase()} risk (${Math.round(r.risk_score)}%) - MRR: $${Math.round(r.mrr)}`
    ).join('\n');

    return {
      response: `⚠️ **High-Risk Customers Detected:**\n\n${summary}\n\n**Recommended Actions:**\n1. Send retention emails immediately\n2. Schedule direct calls for critical cases\n3. Consider temporary discounts for high-MRR customers\n4. Activate retention campaigns`,
      type: 'churn',
      data: risks
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// UPSELL QUERY HANDLER
// ================================================
async function handleUpsellQuery(message) {
  try {
    const opportunities = await db.all(`
      SELECT c.id, c.name, c.email, c.mrr, uo.opportunity_type, uo.estimated_value, uo.confidence_score
      FROM upsell_opportunities uo
      JOIN customers c ON uo.customer_id = c.id
      WHERE uo.status = 'pending'
      ORDER BY uo.estimated_value DESC
      LIMIT 10
    `);

    if (opportunities.length === 0) {
      return {
        response: '📊 No pending upsell opportunities at the moment. Run the upsell agent to find new opportunities.',
        type: 'upsell',
        data: []
      };
    }

    const totalValue = opportunities.reduce((sum, o) => sum + o.estimated_value, 0);
    const summary = opportunities.map(o => 
      `• **${o.name}**: ${o.opportunity_type} - Est. Value: $${Math.round(o.estimated_value)}/year (${Math.round(o.confidence_score)}% confidence)`
    ).join('\n');

    return {
      response: `🚀 **Upsell & Cross-sell Opportunities:**\n\n${summary}\n\n**Total Potential Revenue: $${Math.round(totalValue)}/year**\n\nThese customers are ready for upgrades and complementary products!`,
      type: 'upsell',
      data: opportunities
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// FINANCIAL QUERY HANDLER
// ================================================
async function handleFinancialQuery(message) {
  try {
    const snapshot = await db.get(`
      SELECT * FROM financial_snapshots 
      ORDER BY created_at DESC LIMIT 1
    `);

    if (!snapshot) {
      return {
        response: 'No financial data available yet. Run the financial agent to generate projections.',
        type: 'financial'
      };
    }

    const risks = [];
    if (snapshot.runway_months < 6) risks.push('🔴 CRITICAL: Runway less than 6 months');
    if (snapshot.runway_months < 12) risks.push('🟡 WARNING: Runway less than 12 months');
    if (snapshot.churn_rate > 10) risks.push('🔴 HIGH CHURN: Monthly churn exceeds 10%');
    if (snapshot.growth_rate < 0) risks.push('🔴 NEGATIVE GROWTH: Business is contracting');

    const riskSection = risks.length > 0 ? `\n\n**⚠️ Risks Detected:**\n${risks.join('\n')}` : '';

    return {
      response: `💰 **Financial Health Snapshot:**

**Key Metrics:**
• MRR: $${Math.round(snapshot.mrr).toLocaleString()}
• ARR: $${Math.round(snapshot.arr).toLocaleString()}
• Runway: ${Math.round(snapshot.runway_months)} months
• Monthly Burn: $${Math.round(snapshot.burn_rate).toLocaleString()}
• Growth Rate: ${snapshot.growth_rate.toFixed(1)}% MoM
• Churn Rate: ${snapshot.churn_rate.toFixed(1)}% MoM

**Cash Balance: $${Math.round(snapshot.cash_balance).toLocaleString()}**${riskSection}`,
      type: 'financial',
      data: snapshot
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// CONTRACT QUERY HANDLER
// ================================================
async function handleContractQuery(message) {
  try {
    const contracts = await db.all(`
      SELECT * FROM contracts 
      WHERE deviation_percent > 10
      AND status = 'active'
      ORDER BY deviation_percent DESC
    `);

    if (contracts.length === 0) {
      return {
        response: '✅ All contracts are fairly priced. No renegotiation needed at this time.',
        type: 'contract',
        data: []
      };
    }

    const totalSavings = contracts.reduce((sum, c) => sum + (c.annual_cost - c.market_rate), 0);
    const summary = contracts.map(c => 
      `• **${c.vendor_name}**: $${Math.round(c.annual_cost)}/year vs $${Math.round(c.market_rate)}/year market rate (${Math.round(c.deviation_percent)}% overpriced) - **Save $${Math.round(c.annual_cost - c.market_rate)}/year**`
    ).join('\n');

    return {
      response: `📋 **Overpriced Contracts Detected:**\n\n${summary}\n\n**Total Savings Opportunity: $${Math.round(totalSavings)}/year**\n\nThe Contract Agent will generate negotiation proposals for your approval.`,
      type: 'contract',
      data: contracts
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// AGENT TRIGGER HANDLER
// ================================================
async function handleAgentTrigger(message) {
  try {
    let agentType = null;

    if (message.toLowerCase().includes('churn')) agentType = 'churn_prediction';
    else if (message.toLowerCase().includes('upsell')) agentType = 'upsell_crosssell';
    else if (message.toLowerCase().includes('financial')) agentType = 'financial_projection';
    else if (message.toLowerCase().includes('contract')) agentType = 'contract_renegotiation';

    if (!agentType) {
      return { response: 'Please specify which agent to run: churn, upsell, financial, or contract', type: 'error' };
    }

    const result = await scheduler.triggerAgent(agentType);

    return {
      response: `⚡ **${KB.agents[agentType].name} Executed**\n\n✓ Decisions Made: ${result.decisions}\n✓ Approvals Required: ${result.approvalsRequired}\n\nResults available in dashboard.`,
      type: 'trigger',
      data: result
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// APPROVAL HANDLER
// ================================================
async function handleApprovalQuery(message) {
  try {
    const approvals = await approvalEngine.getPendingApprovals();

    if (approvals.length === 0) {
      return {
        response: '✅ No pending approvals. All decisions have been handled.',
        type: 'approval',
        data: []
      };
    }

    const summary = approvals.map(a => 
      `• **${a.agent_type}** - ${a.action_type} (${Math.round(a.confidence_score)}% confidence)`
    ).join('\n');

    return {
      response: `📋 **${approvals.length} Pending Approvals:**\n\n${summary}\n\nUse the dashboard to approve or reject these decisions.`,
      type: 'approval',
      data: approvals
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// ACTIVITY HANDLER
// ================================================
async function handleActivityQuery(message) {
  try {
    const logs = await db.all(`
      SELECT * FROM activity_logs 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    if (logs.length === 0) {
      return {
        response: 'No activity logged yet. Run agents to generate activity.',
        type: 'activity',
        data: []
      };
    }

    const summary = logs.slice(0, 10).map(l => 
      `• **${l.agent_type}** - ${l.action_type} (${l.status})`
    ).join('\n');

    return {
      response: `📝 **Recent Agent Activity:**\n\n${summary}\n\nTotal activities: ${logs.length}`,
      type: 'activity',
      data: logs
    };
  } catch (error) {
    return { response: `Error: ${error.message}`, type: 'error' };
  }
}

// ================================================
// EXPORT
// ================================================
export default router;

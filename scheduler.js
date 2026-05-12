import cron from 'node-cron';
import { getDatabase } from './db.js';
import churnAgent from './agents/churnAgent.js';
import upsellAgent from './agents/upsellAgent.js';
import financialAgent from './agents/financialAgent.js';
import contractAgent from './agents/contractAgent.js';
import approvalEngine from './approval.js';

export class AgentScheduler {
  constructor() {
    this.jobs = new Map();
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Scheduler already running');
      return;
    }

    console.log('🚀 Starting Agent Scheduler...');
    this.isRunning = true;

    // Churn Prediction - Every 15 minutes
    this.scheduleAgent('churn', '*/15 * * * *', async () => {
      console.log('🔍 Running Churn Prediction Agent...');
      const result = await churnAgent.analyze();
      await this.logExecution('churn_prediction', result);
    });

    // Upsell & Cross-sell - Every hour
    this.scheduleAgent('upsell', '0 * * * *', async () => {
      console.log('📈 Running Upsell Agent...');
      const result = await upsellAgent.analyze();
      await this.logExecution('upsell_crosssell', result);
    });

    // Financial Projection - Every 15 minutes
    this.scheduleAgent('financial', '*/15 * * * *', async () => {
      console.log('💰 Running Financial Projection Agent...');
      const result = await financialAgent.analyze();
      await this.logExecution('financial_projection', result);
    });

    // Contract Renegotiation - Every 6 hours
    this.scheduleAgent('contract', '0 */6 * * *', async () => {
      console.log('📋 Running Contract Renegotiation Agent...');
      const result = await contractAgent.analyze();
      await this.logExecution('contract_renegotiation', result);
    });

    // Cleanup expired approvals - Every hour
    this.scheduleAgent('cleanup', '0 * * * *', async () => {
      console.log('🧹 Cleaning up expired approvals...');
      await approvalEngine.cleanupExpiredApprovals();
    });

    console.log('✅ All agents scheduled successfully');
  }

  scheduleAgent(name, cronExpression, callback) {
    const job = cron.schedule(cronExpression, callback, {
      scheduled: false
    });

    job.start();
    this.jobs.set(name, job);
    console.log(`✓ Scheduled ${name} agent: ${cronExpression}`);
  }

  async logExecution(agentType, result) {
    const db = await getDatabase();

    try {
      await db.run(
        `INSERT INTO agent_executions (agent_type, execution_status, decisions_made, approvals_required, started_at, completed_at)
         VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          agentType,
          result.success ? 'completed' : 'failed',
          result.decisions || 0,
          result.approvalsRequired || 0
        ]
      );
    } catch (error) {
      console.error('Error logging execution:', error);
    }
  }

  async stop() {
    console.log('🛑 Stopping Agent Scheduler...');
    for (const [name, job] of this.jobs) {
      job.stop();
      console.log(`✓ Stopped ${name} agent`);
    }
    this.isRunning = false;
    console.log('✅ Scheduler stopped');
  }

  async triggerAgent(agentType) {
    console.log(`⚡ Manually triggering ${agentType} agent...`);

    try {
      let result;
      switch (agentType) {
        case 'churn_prediction':
          result = await churnAgent.analyze();
          break;
        case 'upsell_crosssell':
          result = await upsellAgent.analyze();
          break;
        case 'financial_projection':
          result = await financialAgent.analyze();
          break;
        case 'contract_renegotiation':
          result = await contractAgent.analyze();
          break;
        default:
          return { success: false, error: 'Unknown agent type' };
      }

      await this.logExecution(agentType, result);
      return result;
    } catch (error) {
      console.error('Error triggering agent:', error);
      return { success: false, error: error.message };
    }
  }

  getStatus() {
    return {
      running: this.isRunning,
      agents: Array.from(this.jobs.keys()),
      jobCount: this.jobs.size
    };
  }
}

export default new AgentScheduler();

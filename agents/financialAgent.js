import { getDatabase } from '../db.js';

export class FinancialAgent {
  constructor() {
    this.name = 'Financial Projection Agent';
    this.type = 'financial_projection';
  }

  async analyze() {
    const db = await getDatabase();

    try {
      // Get current financial data
      const customers = await db.all(`SELECT SUM(mrr) as total_mrr FROM customers`);
      const totalMRR = customers[0]?.total_mrr || 0;

      // Get recent transactions for churn calculation
      const churnData = await db.all(`
        SELECT COUNT(*) as churn_count FROM churn_predictions 
        WHERE risk_level = 'critical' 
        AND created_at > datetime('now', '-30 days')
      `);

      const churnRate = this.calculateChurnRate(totalMRR, churnData[0]?.churn_count || 0);
      const growthRate = this.simulateGrowthRate();
      const burnRate = this.calculateBurnRate();
      const cashBalance = this.getCashBalance();
      const runway = this.calculateRunway(cashBalance, burnRate);
      const arr = totalMRR * 12;

      // Store snapshot
      await db.run(
        `INSERT INTO financial_snapshots (mrr, arr, runway_months, burn_rate, growth_rate, churn_rate, cash_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [totalMRR, arr, runway, burnRate, growthRate, churnRate, cashBalance]
      );

      // Identify risks
      const risks = this.identifyRisks(runway, churnRate, growthRate);

      return {
        success: true,
        snapshot: {
          mrr: totalMRR,
          arr: arr,
          runway_months: runway,
          burn_rate: burnRate,
          growth_rate: growthRate,
          churn_rate: churnRate,
          cash_balance: cashBalance
        },
        risks: risks,
        projections: this.projectNextQuarter(totalMRR, growthRate, churnRate)
      };
    } catch (error) {
      console.error('Financial Agent Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculateChurnRate(mrr, churnCount) {
    if (mrr === 0) return 0;
    return Math.min(100, (churnCount / 10) * 100); // Simplified calculation
  }

  simulateGrowthRate() {
    // In production, calculate from actual data
    return 8.5; // 8.5% MoM growth
  }

  calculateBurnRate() {
    // In production, calculate from actual expenses
    return 50000; // $50k monthly burn rate
  }

  getCashBalance() {
    // In production, fetch from accounting system
    return 500000; // $500k cash balance
  }

  calculateRunway(cashBalance, burnRate) {
    if (burnRate <= 0) return 999;
    return Math.floor(cashBalance / burnRate);
  }

  identifyRisks(runway, churnRate, growthRate) {
    const risks = [];

    if (runway < 6) {
      risks.push({
        level: 'CRITICAL',
        message: 'Runway less than 6 months',
        action: 'Immediate fundraising or cost reduction required'
      });
    } else if (runway < 12) {
      risks.push({
        level: 'WARNING',
        message: 'Runway less than 12 months',
        action: 'Plan fundraising or profitability roadmap'
      });
    }

    if (churnRate > 10) {
      risks.push({
        level: 'HIGH_CHURN',
        message: 'Monthly churn rate exceeds 10%',
        action: 'Activate churn prevention programs'
      });
    }

    if (growthRate < 0) {
      risks.push({
        level: 'NEGATIVE_GROWTH',
        message: 'Business is contracting',
        action: 'Review product-market fit and sales strategy'
      });
    }

    if (churnRate > growthRate && growthRate > 0) {
      risks.push({
        level: 'CHURN_EXCEEDS_GROWTH',
        message: 'Losing customers faster than acquiring',
        action: 'Prioritize retention over acquisition'
      });
    }

    return risks;
  }

  projectNextQuarter(mrr, growthRate, churnRate) {
    const projections = [];
    let currentMRR = mrr;

    for (let month = 1; month <= 3; month++) {
      const netGrowth = (growthRate - churnRate) / 100;
      currentMRR = currentMRR * (1 + netGrowth);
      
      projections.push({
        month: month,
        projected_mrr: Math.round(currentMRR),
        projected_arr: Math.round(currentMRR * 12)
      });
    }

    return projections;
  }
}

export default new FinancialAgent();

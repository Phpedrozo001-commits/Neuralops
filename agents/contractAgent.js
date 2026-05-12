import { getDatabase } from '../db.js';

export class ContractAgent {
  constructor() {
    this.name = 'Contract Renegotiation Agent';
    this.type = 'contract_renegotiation';
    this.priceDeviationThreshold = 10; // 10% above market
  }

  async analyze() {
    const db = await getDatabase();
    const decisions = [];
    const approvalsNeeded = [];

    try {
      // Get all active contracts
      const contracts = await db.all(`
        SELECT id, vendor_name, annual_cost, market_rate 
        FROM contracts 
        WHERE status = 'active'
      `);

      for (const contract of contracts) {
        const deviation = this.calculateDeviation(contract.annual_cost, contract.market_rate);

        if (deviation > this.priceDeviationThreshold) {
          const savings = contract.annual_cost - contract.market_rate;
          const leverage = this.calculateLeverage(deviation, contract.annual_cost, contract.market_rate);

          // Update contract with deviation info
          await db.run(
            `UPDATE contracts SET deviation_percent = ? WHERE id = ?`,
            [deviation, contract.id]
          );

          const decision = {
            contract_id: contract.id,
            vendor_name: contract.vendor_name,
            current_cost: contract.annual_cost,
            market_rate: contract.market_rate,
            deviation_percent: deviation,
            potential_savings: savings,
            leverage_score: leverage
          };

          decisions.push(decision);

          // Create approval for renegotiation
          approvalsNeeded.push({
            agent_type: this.type,
            action_type: 'send_renegotiation_proposal',
            contract_id: contract.id,
            decision_data: JSON.stringify(decision),
            confidence_score: Math.min(100, leverage)
          });
        }
      }

      // Create approval requests
      for (const approval of approvalsNeeded) {
        await db.run(
          `INSERT INTO approvals (agent_type, action_type, contract_id, decision_data, confidence_score, expires_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '+72 hours'))`,
          [approval.agent_type, approval.action_type, approval.contract_id, approval.decision_data, approval.confidence_score]
        );
      }

      return {
        success: true,
        decisions: decisions.length,
        approvalsRequired: approvalsNeeded.length,
        details: decisions,
        totalPotentialSavings: decisions.reduce((sum, d) => sum + d.potential_savings, 0)
      };
    } catch (error) {
      console.error('Contract Agent Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculateDeviation(currentCost, marketRate) {
    if (marketRate === 0) return 0;
    return ((currentCost - marketRate) / marketRate) * 100;
  }

  calculateLeverage(deviation, currentCost, marketRate) {
    // Leverage score based on deviation and contract value
    const deviationScore = Math.min(50, deviation * 2);
    const valueScore = Math.min(50, (currentCost / 100000) * 50);
    return Math.min(100, deviationScore + valueScore);
  }

  generateRenegotiationEmail(vendorName, currentCost, marketRate, savings) {
    const monthlyMarket = marketRate / 12;
    const monthlyCurrent = currentCost / 12;

    return `
Dear ${vendorName},

We value our partnership and would like to discuss optimizing our contract terms.

Current Terms:
- Monthly Cost: $${monthlyCurrent.toFixed(2)}
- Annual Cost: $${currentCost.toFixed(2)}

Market Analysis:
We've reviewed current market rates for similar services and found that we could achieve better value at $${monthlyMarket.toFixed(2)}/month ($${marketRate.toFixed(2)}/year).

Proposed Savings: $${savings.toFixed(2)}/year

We believe this represents a fair market rate while maintaining the quality service we've experienced. We'd like to discuss this proposal at your earliest convenience.

Best regards,
Procurement Team
    `;
  }
}

export default new ContractAgent();

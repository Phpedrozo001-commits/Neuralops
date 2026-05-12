import { getDatabase } from '../db.js';

export class UpsellAgent {
  constructor() {
    this.name = 'Upsell & Cross-sell Agent';
    this.type = 'upsell_crosssell';
    this.confidenceThreshold = 60;
  }

  async analyze() {
    const db = await getDatabase();
    const decisions = [];
    const approvalsNeeded = [];

    try {
      const customers = await db.all(`
        SELECT id, name, email, mrr, engagement_score 
        FROM customers 
        WHERE mrr > 0
      `);

      for (const customer of customers) {
        const opportunities = this.identifyOpportunities(customer);

        for (const opp of opportunities) {
          if (opp.confidence >= this.confidenceThreshold) {
            // Store opportunity
            await db.run(
              `INSERT INTO upsell_opportunities (customer_id, opportunity_type, estimated_value, confidence_score, best_offer_time)
               VALUES (?, ?, ?, ?, ?)`,
              [customer.id, opp.type, opp.estimatedValue, opp.confidence, opp.bestTime]
            );

            decisions.push({
              customer_id: customer.id,
              customer_name: customer.name,
              opportunity_type: opp.type,
              estimated_value: opp.estimatedValue,
              confidence: opp.confidence,
              best_offer_time: opp.bestTime
            });

            // High-value opportunities need approval
            if (opp.estimatedValue > 5000) {
              approvalsNeeded.push({
                agent_type: this.type,
                action_type: 'send_upsell_offer',
                customer_id: customer.id,
                decision_data: JSON.stringify({
                  opportunity: opp,
                  customer_name: customer.name
                }),
                confidence_score: opp.confidence
              });
            }
          }
        }
      }

      // Create approval requests
      for (const approval of approvalsNeeded) {
        await db.run(
          `INSERT INTO approvals (agent_type, action_type, customer_id, decision_data, confidence_score, expires_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '+24 hours'))`,
          [approval.agent_type, approval.action_type, approval.customer_id, approval.decision_data, approval.confidence_score]
        );
      }

      return {
        success: true,
        decisions: decisions.length,
        approvalsRequired: approvalsNeeded.length,
        details: decisions
      };
    } catch (error) {
      console.error('Upsell Agent Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  identifyOpportunities(customer) {
    const opportunities = [];

    // Upsell opportunity (upgrade plan)
    if (customer.mrr > 100 && customer.engagement_score > 70) {
      opportunities.push({
        type: 'upsell',
        estimatedValue: customer.mrr * 2 * 12, // Annual value
        confidence: Math.min(95, 60 + customer.engagement_score / 2),
        bestTime: this.calculateBestOfferTime(customer.engagement_score)
      });
    }

    // Cross-sell opportunity
    if (customer.mrr > 50 && customer.engagement_score > 60) {
      opportunities.push({
        type: 'crosssell',
        estimatedValue: Math.round(customer.mrr * 0.3 * 12), // Annual value
        confidence: Math.min(90, 50 + customer.engagement_score / 2),
        bestTime: this.calculateBestOfferTime(customer.engagement_score)
      });
    }

    // Add-on opportunity
    if (customer.engagement_score > 75) {
      opportunities.push({
        type: 'addon',
        estimatedValue: Math.round(customer.mrr * 0.15 * 12), // Annual value
        confidence: Math.min(85, 55 + customer.engagement_score / 2),
        bestTime: this.calculateBestOfferTime(customer.engagement_score)
      });
    }

    return opportunities;
  }

  calculateBestOfferTime(engagementScore) {
    const now = new Date();
    let delayHours = 48;

    if (engagementScore > 80) {
      delayHours = 24;
    } else if (engagementScore > 70) {
      delayHours = 48;
    } else {
      delayHours = 72;
    }

    const bestTime = new Date(now.getTime() + delayHours * 60 * 60 * 1000);
    return bestTime.toISOString();
  }
}

export default new UpsellAgent();

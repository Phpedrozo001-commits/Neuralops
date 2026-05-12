import { getDatabase } from '../db.js';

export class ChurnPredictionAgent {
  constructor() {
    this.name = 'Churn Prediction Agent';
    this.type = 'churn_prediction';
    this.riskThreshold = 40;
  }

  async analyze() {
    const db = await getDatabase();
    const decisions = [];
    const approvalsNeeded = [];

    try {
      // Get all customers with engagement data
      const customers = await db.all(`
        SELECT id, name, email, mrr, engagement_score, last_login 
        FROM customers 
        WHERE mrr > 0
      `);

      for (const customer of customers) {
        const riskScore = this.calculateChurnRisk(customer);
        const riskLevel = this.getRiskLevel(riskScore);

        // Store prediction
        await db.run(
          `INSERT INTO churn_predictions (customer_id, risk_score, risk_level, predicted_churn_date)
           VALUES (?, ?, ?, datetime('now', '+30 days'))`,
          [customer.id, riskScore, riskLevel]
        );

        if (riskScore >= this.riskThreshold) {
          const actions = this.getRetentionActions(riskLevel, customer.mrr);
          
          const decision = {
            customer_id: customer.id,
            customer_name: customer.name,
            risk_score: riskScore,
            risk_level: riskLevel,
            actions: actions,
            mrr: customer.mrr
          };

          decisions.push(decision);

          // Critical actions need approval
          if (riskLevel === 'critical' && actions.includes('apply_discount')) {
            approvalsNeeded.push({
              agent_type: this.type,
              action_type: 'apply_discount',
              customer_id: customer.id,
              decision_data: JSON.stringify(decision),
              confidence_score: riskScore
            });
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
      console.error('Churn Agent Error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  calculateChurnRisk(customer) {
    let risk = 0;

    // Engagement score (0-100)
    if (customer.engagement_score < 30) risk += 40;
    else if (customer.engagement_score < 50) risk += 20;

    // Last login recency
    if (customer.last_login) {
      const lastLogin = new Date(customer.last_login);
      const daysSinceLogin = Math.floor((Date.now() - lastLogin) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLogin > 30) risk += 30;
      else if (daysSinceLogin > 14) risk += 15;
    } else {
      risk += 35;
    }

    // MRR consideration
    if (customer.mrr < 100) risk += 10;

    return Math.min(100, risk);
  }

  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  getRetentionActions(riskLevel, mrr) {
    const actions = [];

    switch (riskLevel) {
      case 'critical':
        actions.push('send_urgent_retention_email');
        actions.push('schedule_direct_call');
        if (mrr > 150) actions.push('apply_discount');
        break;
      case 'high':
        actions.push('send_retention_email');
        actions.push('offer_feature_highlight');
        if (mrr > 100) actions.push('apply_discount');
        break;
      case 'medium':
        actions.push('send_engagement_email');
        actions.push('offer_free_trial_premium_feature');
        break;
      default:
        actions.push('send_newsletter');
    }

    return actions;
  }
}

export default new ChurnPredictionAgent();

// agents/churnAgent.js
import { getDatabase } from '../db.js';
import { analyzeChurnWithAI } from '../services/aiService.js';

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
      const customers = await db.all(`
        SELECT id, name, email, mrr, engagement_score, last_login 
        FROM customers 
        WHERE mrr > 0
      `);

      if (customers.length === 0) {
        return {
          success: true,
          decisions: 0,
          approvalsRequired: 0,
          message: 'Nenhum cliente cadastrado. Adicione clientes para análise de churn.',
          details: []
        };
      }

      for (const customer of customers) {
        const riskScore = this.calculateChurnRisk(customer);
        const riskLevel = this.getRiskLevel(riskScore);
        const baseActions = this.getRetentionActions(riskLevel, customer.mrr);

        // IA analisa o cliente e gera insights personalizados
        let aiInsights = null;
        if (riskScore >= this.riskThreshold) {
          aiInsights = await analyzeChurnWithAI(customer, riskScore, riskLevel, baseActions);
        }

        // Armazena predição com insights da IA
        await db.run(
          `INSERT INTO churn_predictions (customer_id, risk_score, risk_level, predicted_churn_date)
           VALUES (?, ?, ?, datetime('now', '+30 days'))`,
          [customer.id, riskScore, riskLevel]
        );

        if (riskScore >= this.riskThreshold) {
          const decision = {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_email: customer.email,
            risk_score: riskScore,
            risk_level: riskLevel,
            base_actions: baseActions,
            ai_insights: aiInsights,
            mrr: customer.mrr,
            // Usa análise da IA se disponível, senão usa algoritmo base
            churn_probability: aiInsights?.churn_probability || riskScore,
            retention_message: aiInsights?.retention_message || this.getDefaultMessage(riskLevel, customer.name),
            recommended_actions: aiInsights?.top_actions || baseActions,
            urgency: aiInsights?.urgency || riskLevel
          };

          decisions.push(decision);

          // Cria aprovação para ações críticas
          if (riskLevel === 'critical' || riskLevel === 'high') {
            const discountPercent = customer.mrr > 500 ? 20 : customer.mrr > 200 ? 15 : 10;
            
            approvalsNeeded.push({
              agent_type: this.type,
              action_type: 'apply_discount',
              customer_id: customer.id,
              decision_data: JSON.stringify({
                ...decision,
                discount_percent: discountPercent,
                email_subject: `Oferta especial para ${customer.name}`,
                email_content: decision.retention_message
              }),
              confidence_score: riskScore
            });
          }
        }
      }

      // Cria requests de aprovação no banco
      for (const approval of approvalsNeeded) {
        await db.run(
          `INSERT INTO approvals (agent_type, action_type, customer_id, decision_data, confidence_score, expires_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '+24 hours'))`,
          [approval.agent_type, approval.action_type, approval.customer_id, 
           approval.decision_data, approval.confidence_score]
        );
      }

      // Log da execução
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'completed', 'success',
         JSON.stringify({ customers_analyzed: customers.length, high_risk: decisions.length, approvals_created: approvalsNeeded.length })]
      );

      return {
        success: true,
        decisions: decisions.length,
        approvalsRequired: approvalsNeeded.length,
        customers_analyzed: customers.length,
        details: decisions
      };

    } catch (error) {
      console.error('Churn Agent Error:', error);
      
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'failed', 'error', JSON.stringify({ error: error.message })]
      ).catch(() => {});

      return { success: false, error: error.message };
    }
  }

  calculateChurnRisk(customer) {
    let risk = 0;

    // Engagement score tem maior peso
    if (customer.engagement_score < 20) risk += 45;
    else if (customer.engagement_score < 30) risk += 35;
    else if (customer.engagement_score < 50) risk += 20;
    else if (customer.engagement_score < 70) risk += 10;

    // Dias desde último login
    if (customer.last_login) {
      const lastLogin = new Date(customer.last_login);
      const daysSinceLogin = Math.floor((Date.now() - lastLogin) / (1000 * 60 * 60 * 24));
      if (daysSinceLogin > 60) risk += 35;
      else if (daysSinceLogin > 30) risk += 25;
      else if (daysSinceLogin > 14) risk += 15;
      else if (daysSinceLogin > 7) risk += 5;
    } else {
      risk += 30; // Nunca fez login = sinal ruim
    }

    // MRR baixo indica menor comprometimento
    if (customer.mrr < 50) risk += 15;
    else if (customer.mrr < 100) risk += 8;
    else if (customer.mrr > 500) risk -= 5; // Alto MRR = mais investido

    return Math.min(100, Math.max(0, risk));
  }

  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  getRetentionActions(riskLevel, mrr) {
    switch (riskLevel) {
      case 'critical':
        return [
          'Contato urgente por telefone',
          'Oferecer desconto personalizado',
          'Agendar call com Customer Success',
          'Enviar email de retenção urgente'
        ];
      case 'high':
        return [
          'Enviar email de retenção',
          'Oferecer extensão de trial de features premium',
          'Agendar demo das novidades',
          mrr > 200 ? 'Oferecer desconto 15%' : 'Oferecer mês grátis'
        ];
      case 'medium':
        return [
          'Enviar email com cases de sucesso',
          'Oferecer webinar exclusivo',
          'Compartilhar melhores práticas'
        ];
      default:
        return ['Enviar newsletter de engajamento'];
    }
  }

  getDefaultMessage(riskLevel, customerName) {
    const messages = {
      critical: `${customerName}, percebemos que você não tem acessado sua conta e queremos entender como podemos ajudar. Temos uma oferta especial preparada para garantir que você continue aproveitando ao máximo o NeuralOps.`,
      high: `${customerName}, notamos uma redução no seu uso recente e gostaríamos de mostrar funcionalidades que podem impactar diretamente seus resultados.`,
      medium: `${customerName}, temos novidades e casos de sucesso que achamos que serão relevantes para o seu negócio.`
    };
    return messages[riskLevel] || `${customerName}, como está sua experiência com o NeuralOps?`;
  }
}

export default new ChurnPredictionAgent();

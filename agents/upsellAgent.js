// agents/upsellAgent.js
import { getDatabase } from '../db.js';
import { analyzeUpsellWithAI } from '../services/aiService.js';

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

      if (customers.length === 0) {
        return {
          success: true,
          decisions: 0,
          approvalsRequired: 0,
          message: 'Nenhum cliente cadastrado para análise de upsell.',
          details: []
        };
      }

      for (const customer of customers) {
        const baseOpportunities = this.identifyOpportunities(customer);
        const highConfidenceOpps = baseOpportunities.filter(o => o.confidence >= this.confidenceThreshold);

        if (highConfidenceOpps.length === 0) continue;

        // IA analisa e enriquece as oportunidades
        const aiInsights = await analyzeUpsellWithAI(customer, highConfidenceOpps);

        for (const opp of highConfidenceOpps) {
          // Salva oportunidade no banco
          await db.run(
            `INSERT INTO upsell_opportunities (customer_id, opportunity_type, estimated_value, confidence_score, best_offer_time)
             VALUES (?, ?, ?, ?, ?)`,
            [customer.id, opp.type, opp.estimatedValue, opp.confidence, opp.bestTime]
          );

          const decision = {
            customer_id: customer.id,
            customer_name: customer.name,
            customer_email: customer.email,
            opportunity_type: opp.type,
            estimated_value: opp.estimatedValue,
            confidence: aiInsights?.propensity_score || opp.confidence,
            best_offer_time: aiInsights?.best_timing || opp.bestTime,
            // Insights da IA
            sales_pitch: aiInsights?.sales_pitch || this.getDefaultPitch(opp.type, customer.name),
            recommended_offer: aiInsights?.recommended_offer || this.getDefaultOffer(opp.type, customer.mrr),
            ai_reasoning: aiInsights?.reasoning || null
          };

          decisions.push(decision);

          // Oportunidades de alto valor precisam de aprovação
          if (opp.estimatedValue > 2000 || opp.confidence >= 80) {
            approvalsNeeded.push({
              agent_type: this.type,
              action_type: 'send_upsell_offer',
              customer_id: customer.id,
              decision_data: JSON.stringify(decision),
              confidence_score: decision.confidence
            });
          }
        }
      }

      // Cria aprovações
      for (const approval of approvalsNeeded) {
        await db.run(
          `INSERT INTO approvals (agent_type, action_type, customer_id, decision_data, confidence_score, expires_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '+48 hours'))`,
          [approval.agent_type, approval.action_type, approval.customer_id,
           approval.decision_data, approval.confidence_score]
        );
      }

      // Log
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'completed', 'success',
         JSON.stringify({ customers_analyzed: customers.length, opportunities: decisions.length, approvals: approvalsNeeded.length })]
      );

      return {
        success: true,
        decisions: decisions.length,
        approvalsRequired: approvalsNeeded.length,
        customers_analyzed: customers.length,
        total_potential_value: decisions.reduce((sum, d) => sum + (d.estimated_value || 0), 0),
        details: decisions
      };

    } catch (error) {
      console.error('Upsell Agent Error:', error);

      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'failed', 'error', JSON.stringify({ error: error.message })]
      ).catch(() => {});

      return { success: false, error: error.message };
    }
  }

  identifyOpportunities(customer) {
    const opportunities = [];

    // Upsell: cliente engajado com MRR médio
    if (customer.mrr >= 50 && customer.engagement_score >= 65) {
      const confidence = Math.min(95, 55 + (customer.engagement_score - 65) * 1.5 + (customer.mrr / 100) * 2);
      opportunities.push({
        type: 'upsell',
        estimatedValue: Math.round(customer.mrr * 1.5 * 12),
        confidence: Math.round(confidence),
        bestTime: this.getBestOfferTime(customer.engagement_score)
      });
    }

    // Cross-sell: engajamento moderado
    if (customer.mrr >= 30 && customer.engagement_score >= 55) {
      const confidence = Math.min(90, 45 + (customer.engagement_score - 55) * 1.2);
      opportunities.push({
        type: 'crosssell',
        estimatedValue: Math.round(customer.mrr * 0.4 * 12),
        confidence: Math.round(confidence),
        bestTime: this.getBestOfferTime(customer.engagement_score)
      });
    }

    // Add-on: alta engajamento
    if (customer.engagement_score >= 75) {
      const confidence = Math.min(85, 50 + (customer.engagement_score - 75) * 1.5);
      opportunities.push({
        type: 'addon',
        estimatedValue: Math.round(customer.mrr * 0.2 * 12),
        confidence: Math.round(confidence),
        bestTime: this.getBestOfferTime(customer.engagement_score)
      });
    }

    return opportunities;
  }

  getBestOfferTime(engagementScore) {
    const delayHours = engagementScore >= 85 ? 12 : engagementScore >= 70 ? 24 : 48;
    return new Date(Date.now() + delayHours * 3600000).toISOString();
  }

  getDefaultPitch(type, customerName) {
    const pitches = {
      upsell: `${customerName}, com base no seu uso crescente, identificamos que você está pronto para o próximo nível. Nosso plano avançado oferece recursos que podem multiplicar seus resultados.`,
      crosssell: `${customerName}, usuários com seu perfil de engajamento costumam se beneficiar muito de nosso módulo complementar. Seria uma evolução natural para o seu negócio.`,
      addon: `${customerName}, seu alto engajamento mostra que você está extraindo muito valor da plataforma. Nosso add-on premium pode potencializar ainda mais seus resultados.`
    };
    return pitches[type] || `${customerName}, temos uma oferta especial baseada no seu perfil de uso.`;
  }

  getDefaultOffer(type, mrr) {
    const offers = {
      upsell: `Upgrade para o Plano Growth — inclui agentes ilimitados, integrações avançadas e suporte 24/7`,
      crosssell: `Módulo de Analytics Avançado — dashboards customizados e relatórios automatizados`,
      addon: `Add-on de Integrations — conecte com Salesforce, HubSpot e mais 50 ferramentas`
    };
    return offers[type] || 'Plano expandido com mais recursos e suporte prioritário';
  }
}

export default new UpsellAgent();

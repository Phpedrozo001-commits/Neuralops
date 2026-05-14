// agents/financialAgent.js
// CORRIGIDO: removidos todos os valores hardcoded
// Agora usa dados reais do banco + variáveis de ambiente configuráveis

import { getDatabase } from '../db.js';
import { analyzeFinancialsWithAI } from '../services/aiService.js';

export class FinancialAgent {
  constructor() {
    this.name = 'Financial Projection Agent';
    this.type = 'financial_projection';
  }

  async analyze() {
    const db = await getDatabase();

    try {
      // ── MRR real do banco ──────────────────────────────
      const mrrData = await db.get(`
        SELECT 
          COALESCE(SUM(mrr), 0) as total_mrr,
          COUNT(*) as customer_count,
          COALESCE(AVG(mrr), 0) as avg_mrr
        FROM customers
        WHERE mrr > 0
      `);
      const totalMRR = mrrData?.total_mrr || 0;
      const customerCount = mrrData?.customer_count || 0;

      // ── Taxa de crescimento real (comparando snapshots) ─
      const growthRate = await this.calculateRealGrowthRate(db, totalMRR);

      // ── Churn rate real ─────────────────────────────────
      const churnRate = await this.calculateRealChurnRate(db, customerCount);

      // ── Burn rate e cash balance via env vars ───────────
      // Configure MONTHLY_BURN_RATE e CASH_BALANCE no Railway
      const burnRate = parseFloat(process.env.MONTHLY_BURN_RATE) || 0;
      const cashBalance = parseFloat(process.env.CASH_BALANCE) || 0;

      // ── Runway calculado com dados reais ─────────────────
      const runway = this.calculateRunway(cashBalance, burnRate, totalMRR);
      const arr = totalMRR * 12;

      // ── Salva snapshot ──────────────────────────────────
      await db.run(
        `INSERT INTO financial_snapshots (mrr, arr, runway_months, burn_rate, growth_rate, churn_rate, cash_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [totalMRR, arr, runway, burnRate, growthRate, churnRate, cashBalance]
      );

      // ── Identifica riscos ───────────────────────────────
      const risks = this.identifyRisks(runway, churnRate, growthRate, totalMRR, burnRate);

      // ── Projeções reais ─────────────────────────────────
      const projections = this.projectNextQuarter(totalMRR, growthRate, churnRate);

      const snapshot = { mrr: totalMRR, arr, runway_months: runway, burn_rate: burnRate, growth_rate: growthRate, churn_rate: churnRate, cash_balance: cashBalance };

      // ── IA analisa a situação financeira ─────────────────
      const aiInsights = await analyzeFinancialsWithAI(snapshot, risks, projections, customerCount);

      // Log da execução
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'completed', 'success',
         JSON.stringify({ mrr: totalMRR, arr, runway, customer_count: customerCount })]
      );

      return {
        success: true,
        snapshot,
        risks,
        projections,
        ai_insights: aiInsights,
        customer_count: customerCount,
        data_source: 'real', // Confirma que são dados reais, não hardcoded
        missing_config: {
          burn_rate_configured: burnRate > 0,
          cash_balance_configured: cashBalance > 0,
          message: burnRate === 0 || cashBalance === 0 
            ? 'Configure MONTHLY_BURN_RATE e CASH_BALANCE no Railway para análise completa de runway'
            : null
        }
      };

    } catch (error) {
      console.error('Financial Agent Error:', error);

      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'failed', 'error', JSON.stringify({ error: error.message })]
      ).catch(() => {});

      return { success: false, error: error.message };
    }
  }

  /**
   * CORRIGIDO: Calcula crescimento REAL comparando snapshots do banco
   * Antes: retornava 8.5 hardcoded
   * Agora: compara MRR atual com snapshot anterior
   */
  async calculateRealGrowthRate(db, currentMRR) {
    try {
      const lastSnapshot = await db.get(`
        SELECT mrr FROM financial_snapshots 
        ORDER BY created_at DESC 
        LIMIT 1
      `);

      if (!lastSnapshot || lastSnapshot.mrr === 0 || currentMRR === 0) {
        return 0; // Sem dados suficientes — retorna 0, não inventa
      }

      const growth = ((currentMRR - lastSnapshot.mrr) / lastSnapshot.mrr) * 100;
      return parseFloat(growth.toFixed(2));
    } catch {
      return 0;
    }
  }

  /**
   * CORRIGIDO: Calcula churn REAL baseado em dados do banco
   * Antes: fórmula simplificada não-realista
   * Agora: ratio de clientes críticos vs total
   */
  async calculateRealChurnRate(db, totalCustomers) {
    if (totalCustomers === 0) return 0;

    try {
      const criticalChurn = await db.get(`
        SELECT COUNT(DISTINCT customer_id) as count 
        FROM churn_predictions 
        WHERE risk_level IN ('critical', 'high')
        AND created_at > datetime('now', '-30 days')
      `);

      const atRisk = criticalChurn?.count || 0;
      return parseFloat(((atRisk / totalCustomers) * 100).toFixed(2));
    } catch {
      return 0;
    }
  }

  /**
   * CORRIGIDO: Runway considera receita gerada pelo negócio
   * Se não tem burn rate configurado, não inventa runway
   */
  calculateRunway(cashBalance, burnRate, mrr) {
    if (burnRate <= 0) {
      return cashBalance > 0 ? 999 : 0; // Sem burn rate configurado
    }
    const netBurn = Math.max(0, burnRate - mrr); // Burn líquido (descontando receita)
    if (netBurn === 0) return 999; // Revenue positive
    return parseFloat((cashBalance / netBurn).toFixed(1));
  }

  identifyRisks(runway, churnRate, growthRate, mrr, burnRate) {
    const risks = [];

    if (mrr === 0) {
      risks.push({
        level: 'INFO',
        message: 'Nenhum cliente com MRR cadastrado',
        action: 'Adicione clientes ao sistema para análise financeira real'
      });
      return risks;
    }

    if (burnRate === 0) {
      risks.push({
        level: 'INFO',
        message: 'MONTHLY_BURN_RATE não configurado',
        action: 'Configure MONTHLY_BURN_RATE e CASH_BALANCE no Railway para análise de runway'
      });
    }

    if (runway > 0 && runway < 6) {
      risks.push({
        level: 'CRITICAL',
        message: `Runway de apenas ${runway} meses`,
        action: 'Fundraising urgente ou redução imediata de custos necessária'
      });
    } else if (runway > 0 && runway < 12) {
      risks.push({
        level: 'WARNING',
        message: `Runway de ${runway} meses`,
        action: 'Planejar captação ou atingir break-even em 6 meses'
      });
    }

    if (churnRate > 15) {
      risks.push({
        level: 'HIGH_CHURN',
        message: `Taxa de churn de ${churnRate}% ao mês`,
        action: 'Ativar programa emergencial de retenção'
      });
    } else if (churnRate > 8) {
      risks.push({
        level: 'ELEVATED_CHURN',
        message: `Churn de ${churnRate}% — acima do ideal (<5%)`,
        action: 'Revisar estratégia de retenção e produto'
      });
    }

    if (growthRate < 0) {
      risks.push({
        level: 'NEGATIVE_GROWTH',
        message: `Crescimento negativo: ${growthRate}% MoM`,
        action: 'Revisão urgente de produto, vendas e marketing'
      });
    } else if (growthRate > 0 && churnRate > growthRate) {
      risks.push({
        level: 'CHURN_EXCEEDS_GROWTH',
        message: 'Perdendo clientes mais rápido do que está ganhando',
        action: 'Priorizar retenção sobre aquisição'
      });
    }

    return risks;
  }

  projectNextQuarter(mrr, growthRate, churnRate) {
    if (mrr === 0) return [];
    const projections = [];
    let currentMRR = mrr;
    const netGrowthRate = (growthRate - churnRate) / 100;

    for (let month = 1; month <= 3; month++) {
      currentMRR = currentMRR * (1 + netGrowthRate);
      projections.push({
        month,
        projected_mrr: Math.round(Math.max(0, currentMRR)),
        projected_arr: Math.round(Math.max(0, currentMRR) * 12),
        growth_assumption: `${growthRate}% crescimento, ${churnRate}% churn`
      });
    }

    return projections;
  }
}

export default new FinancialAgent();

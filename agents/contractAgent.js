// agents/contractAgent.js
import { getDatabase } from '../db.js';
import { analyzeContractWithAI } from '../services/aiService.js';

export class ContractAgent {
  constructor() {
    this.name = 'Contract Renegotiation Agent';
    this.type = 'contract_renegotiation';
    this.priceDeviationThreshold = 10;
  }

  async analyze() {
    const db = await getDatabase();
    const decisions = [];
    const approvalsNeeded = [];

    try {
      const contracts = await db.all(`
        SELECT id, vendor_name, annual_cost, market_rate 
        FROM contracts 
        WHERE status = 'active' AND annual_cost > 0 AND market_rate > 0
      `);

      if (contracts.length === 0) {
        return {
          success: true,
          decisions: 0,
          approvalsRequired: 0,
          message: 'Nenhum contrato ativo cadastrado. Adicione contratos com custo atual e taxa de mercado.',
          totalPotentialSavings: 0,
          details: []
        };
      }

      for (const contract of contracts) {
        const deviation = this.calculateDeviation(contract.annual_cost, contract.market_rate);

        // Atualiza desvio no banco sempre
        await db.run(
          `UPDATE contracts SET deviation_percent = ? WHERE id = ?`,
          [parseFloat(deviation.toFixed(2)), contract.id]
        );

        if (deviation > this.priceDeviationThreshold) {
          const savings = contract.annual_cost - contract.market_rate;
          const leverage = this.calculateLeverage(deviation, contract.annual_cost);

          // IA analisa o contrato e gera estratégia + email de renegociação
          const aiAnalysis = await analyzeContractWithAI({
            ...contract,
            deviation_percent: deviation
          });

          const decision = {
            contract_id: contract.id,
            vendor_name: contract.vendor_name,
            current_cost: contract.annual_cost,
            market_rate: contract.market_rate,
            deviation_percent: parseFloat(deviation.toFixed(2)),
            potential_savings: Math.round(savings),
            leverage_score: Math.round(leverage),
            // Análise da IA
            ai_assessment: aiAnalysis?.assessment || null,
            negotiation_strategy: aiAnalysis?.strategy || null,
            key_arguments: aiAnalysis?.key_arguments || this.getDefaultArguments(deviation, savings),
            negotiation_email: aiAnalysis?.negotiation_email || this.generateFallbackEmail(contract.vendor_name, contract.annual_cost, contract.market_rate, savings),
            success_probability: aiAnalysis?.success_probability || Math.min(85, 40 + leverage / 2),
            best_timing: aiAnalysis?.best_timing || 'Iniciar em até 30 dias, preferencialmente no início do trimestre'
          };

          decisions.push(decision);

          approvalsNeeded.push({
            agent_type: this.type,
            action_type: 'send_renegotiation_proposal',
            contract_id: contract.id,
            decision_data: JSON.stringify(decision),
            confidence_score: decision.success_probability
          });
        }
      }

      // Cria aprovações
      for (const approval of approvalsNeeded) {
        await db.run(
          `INSERT INTO approvals (agent_type, action_type, contract_id, decision_data, confidence_score, expires_at)
           VALUES (?, ?, ?, ?, ?, datetime('now', '+72 hours'))`,
          [approval.agent_type, approval.action_type, approval.contract_id,
           approval.decision_data, approval.confidence_score]
        );
      }

      const totalSavings = decisions.reduce((sum, d) => sum + d.potential_savings, 0);

      // Log
      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'completed', 'success',
         JSON.stringify({ contracts_analyzed: contracts.length, overpriced: decisions.length, total_savings: totalSavings })]
      );

      return {
        success: true,
        decisions: decisions.length,
        approvalsRequired: approvalsNeeded.length,
        contracts_analyzed: contracts.length,
        totalPotentialSavings: totalSavings,
        details: decisions
      };

    } catch (error) {
      console.error('Contract Agent Error:', error);

      await db.run(
        `INSERT INTO activity_logs (agent_type, action_type, result, status, details)
         VALUES (?, ?, ?, ?, ?)`,
        [this.type, 'analyze', 'failed', 'error', JSON.stringify({ error: error.message })]
      ).catch(() => {});

      return { success: false, error: error.message };
    }
  }

  calculateDeviation(currentCost, marketRate) {
    if (!marketRate || marketRate === 0) return 0;
    return ((currentCost - marketRate) / marketRate) * 100;
  }

  calculateLeverage(deviation, currentCost) {
    const deviationScore = Math.min(60, deviation * 2);
    const valueScore = Math.min(40, (currentCost / 50000) * 40);
    return Math.min(100, deviationScore + valueScore);
  }

  getDefaultArguments(deviation, savings) {
    return [
      `Análise de mercado mostra ${deviation.toFixed(1)}% de desvio em relação às práticas atuais`,
      `Economia potencial de $${savings.toLocaleString()}/ano sem redução na qualidade`,
      `Outros fornecedores oferecem serviços equivalentes a preços competitivos`,
      `Manutenção do relacionamento de longo prazo é benéfica para ambas as partes`
    ];
  }

  generateFallbackEmail(vendorName, currentCost, marketRate, savings) {
    const monthlyMarket = (marketRate / 12).toFixed(2);
    const monthlyCurrent = (currentCost / 12).toFixed(2);

    return `Prezado(a) ${vendorName},

Esperamos que esteja bem. Escrevemos para tratar sobre nosso contrato vigente.

Após uma revisão interna e análise comparativa de mercado, identificamos que o valor atual do nosso contrato (US$ ${monthlyCurrent}/mês | US$ ${currentCost.toLocaleString()}/ano) apresenta uma divergência em relação às práticas de mercado atuais para serviços similares (US$ ${monthlyMarket}/mês | US$ ${marketRate.toLocaleString()}/ano).

Valorizamos muito a parceria que construímos ao longo do tempo e, por isso, gostaríamos de propor uma revisão contratual que reflita os valores de mercado e nos permita manter e fortalecer esse relacionamento.

Acreditamos que uma redução para US$ ${monthlyMarket}/mês representaria uma economia de US$ ${savings.toLocaleString()}/ano e nos permitiria continuar sendo clientes de longo prazo com ainda mais comprometimento.

Gostaríamos de agendar uma conversa nos próximos 15 dias para discutir esta proposta. Por favor, confirme sua disponibilidade.

Atenciosamente,
Time de Procurement — NeuralOps`;
  }
}

export default new ContractAgent();

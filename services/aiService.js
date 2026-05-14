// services/aiService.js
// Serviço centralizado de IA — Claude API

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-20250514';

/**
 * Chama Claude API com system prompt e mensagem
 */
async function callClaude(systemPrompt, userMessage, maxTokens = 800) {
  if (!ANTHROPIC_API_KEY) {
    return { success: false, error: 'ANTHROPIC_API_KEY não configurada' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return { success: false, error: `Claude API error: ${response.status} - ${err}` };
    }

    const data = await response.json();
    return { success: true, text: data.content[0].text };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Analisa risco de churn de um cliente com IA
 */
export async function analyzeChurnWithAI(customer, riskScore, riskLevel, existingActions) {
  const system = `Você é um especialista em Customer Success e retenção de clientes SaaS.
Analise o risco de churn e forneça recomendações específicas e acionáveis.
Responda SEMPRE em português brasileiro.
Seja direto e específico — evite generalidades.`;

  const prompt = `Cliente em análise:
- Nome: ${customer.name}
- MRR: $${customer.mrr}/mês
- Engagement Score: ${customer.engagement_score}/100
- Último login: ${customer.last_login || 'nunca registrado'}
- Risk Score calculado: ${riskScore}/100
- Nível de risco: ${riskLevel}
- Ações iniciais identificadas: ${existingActions.join(', ')}

Por favor, forneça:
1. Análise do motivo principal do risco (2-3 frases)
2. Probabilidade real de churn em 30 dias (%)
3. As 3 ações mais eficazes para reter este cliente específico
4. Mensagem personalizada de retenção (2-3 frases, tom empático e profissional)
5. Urgência: baixa/média/alta/crítica

Formato: JSON com campos: analysis, churn_probability, top_actions (array), retention_message, urgency`;

  const result = await callClaude(system, prompt, 600);
  if (!result.success) return null;

  try {
    // Tenta extrair JSON da resposta
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { analysis: result.text, churn_probability: riskScore, top_actions: existingActions, urgency: riskLevel };
  } catch {
    return { analysis: result.text, churn_probability: riskScore, top_actions: existingActions, urgency: riskLevel };
  }
}

/**
 * Analisa oportunidade de upsell com IA
 */
export async function analyzeUpsellWithAI(customer, opportunities) {
  const system = `Você é um especialista em Revenue Expansion e Growth para SaaS.
Analise oportunidades de upsell e cross-sell com base em dados reais do cliente.
Responda SEMPRE em português brasileiro. Seja específico e baseado em dados.`;

  const prompt = `Cliente para análise de upsell:
- Nome: ${customer.name}
- MRR atual: $${customer.mrr}/mês
- Engagement Score: ${customer.engagement_score}/100
- Oportunidades identificadas pelo algoritmo: ${JSON.stringify(opportunities)}

Forneça:
1. Qual é a melhor oportunidade de upsell para este cliente agora e por quê
2. Melhor momento para abordar (timing baseado no engagement score)
3. Argumento de venda personalizado (3-4 frases)
4. Oferta específica recomendada
5. Score de propensão de compra (0-100)

Formato: JSON com campos: best_opportunity, best_timing, sales_pitch, recommended_offer, propensity_score, reasoning`;

  const result = await callClaude(system, prompt, 500);
  if (!result.success) return null;

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { reasoning: result.text };
  } catch {
    return { reasoning: result.text };
  }
}

/**
 * Analisa situação financeira com IA
 */
export async function analyzeFinancialsWithAI(snapshot, risks, projections, customerCount) {
  const system = `Você é um CFO virtual especializado em métricas SaaS.
Analise a saúde financeira da empresa e forneça insights precisos.
Responda SEMPRE em português brasileiro. Use dados reais, nunca invente números.`;

  const prompt = `Situação financeira atual:
- MRR: $${snapshot.mrr?.toLocaleString() || 0}
- ARR: $${snapshot.arr?.toLocaleString() || 0}
- Taxa de crescimento: ${snapshot.growth_rate?.toFixed(1) || 0}% ao mês
- Churn rate: ${snapshot.churn_rate?.toFixed(1) || 0}%
- Runway: ${snapshot.runway_months || 0} meses
- Burn rate: $${snapshot.burn_rate?.toLocaleString() || 0}/mês
- Saldo em caixa: $${snapshot.cash_balance?.toLocaleString() || 0}
- Total de clientes: ${customerCount}

Riscos identificados: ${JSON.stringify(risks)}
Projeções próximos 3 meses: ${JSON.stringify(projections)}

Forneça:
1. Diagnóstico da saúde financeira (3-4 frases)
2. Os 3 maiores riscos financeiros agora
3. As 3 ações mais urgentes para melhorar a situação
4. Previsão realista para 90 dias
5. Indicador geral de saúde: crítico/alerta/estável/saudável/excelente

Formato: JSON com campos: diagnosis, top_risks (array), urgent_actions (array), forecast_90d, health_indicator, confidence_level (0-100)`;

  const result = await callClaude(system, prompt, 700);
  if (!result.success) return null;

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { diagnosis: result.text };
  } catch {
    return { diagnosis: result.text };
  }
}

/**
 * Analisa contrato para renegociação com IA
 */
export async function analyzeContractWithAI(contract) {
  const system = `Você é um especialista em procurement e negociação de contratos B2B.
Analise contratos overpriced e crie estratégias de renegociação eficazes.
Responda SEMPRE em português brasileiro.`;

  const prompt = `Contrato para análise:
- Fornecedor: ${contract.vendor_name}
- Custo atual: $${contract.annual_cost?.toLocaleString()}/ano
- Taxa de mercado: $${contract.market_rate?.toLocaleString()}/ano
- Desvio: ${contract.deviation_percent?.toFixed(1)}% acima do mercado
- Economia potencial: $${(contract.annual_cost - contract.market_rate)?.toLocaleString()}/ano

Forneça:
1. Avaliação da situação (2-3 frases)
2. Estratégia de negociação recomendada
3. Argumentos mais fortes para a renegociação
4. Email profissional de renegociação completo (em português)
5. Probabilidade de sucesso na renegociação (%)
6. Timing ideal para iniciar a negociação

Formato: JSON com campos: assessment, strategy, key_arguments (array), negotiation_email, success_probability, best_timing`;

  const result = await callClaude(system, prompt, 800);
  if (!result.success) return null;

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return { assessment: result.text };
  } catch {
    return { assessment: result.text };
  }
}

/**
 * Chat geral com contexto do negócio
 */
export async function chatWithAI(message, businessContext, conversationHistory = []) {
  const system = `Você é o NeuralOps AI — assistente especializado em inteligência de negócios para SaaS.

Você tem acesso aos dados reais da empresa:
${JSON.stringify(businessContext, null, 2)}

Suas especialidades:
- Análise e prevenção de churn
- Identificação de oportunidades de receita (upsell/cross-sell)
- Projeções e saúde financeira (MRR, ARR, runway, burn rate)
- Análise e renegociação de contratos
- Tomada de decisão estratégica baseada em dados

REGRAS IMPORTANTES:
- Responda SEMPRE em português brasileiro
- Use APENAS os dados fornecidos — nunca invente números
- Seja específico, direto e acionável
- Se os dados estiverem vazios, diga o que precisa ser preenchido no sistema
- Máximo 250 palavras por resposta
- Use bullet points quando listar itens
- Seja empático mas profissional`;

  // Constrói histórico de conversa
  const messages = [];
  if (conversationHistory && Array.isArray(conversationHistory)) {
    for (const msg of conversationHistory.slice(-8)) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: String(msg.content).substring(0, 500) });
      }
    }
  }
  messages.push({ role: 'user', content: message });

  if (!ANTHROPIC_API_KEY) {
    return { 
      success: false, 
      fallback: getFallbackResponse(message, businessContext),
      error: 'ANTHROPIC_API_KEY não configurada'
    };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system,
        messages
      })
    });

    if (!response.ok) {
      return { success: false, fallback: getFallbackResponse(message, businessContext) };
    }

    const data = await response.json();
    return { success: true, text: data.content[0].text };
  } catch (error) {
    return { success: false, fallback: getFallbackResponse(message, businessContext), error: error.message };
  }
}

function getFallbackResponse(message, ctx) {
  const msg = message.toLowerCase();
  const mrr = ctx?.financial?.mrr;
  const churn = ctx?.churnCount?.count;
  const upsell = ctx?.upsellCount?.count;

  if (msg.includes('churn')) {
    return churn > 0 
      ? `Há ${churn} clientes em risco alto/crítico de churn. Acesse a aba Aprovações para ver as ações recomendadas para cada um.`
      : 'Nenhum cliente em risco crítico identificado. Continue monitorando o engagement score.';
  }
  if (msg.includes('upsell') || msg.includes('receita') || msg.includes('venda')) {
    return upsell > 0
      ? `Identifiquei ${upsell} oportunidades de upsell pendentes. Acesse Aprovações para revisar e enviar as ofertas.`
      : 'Sem oportunidades de upsell no momento. Adicione mais clientes para o sistema analisar.';
  }
  if (msg.includes('financ') || msg.includes('mrr') || msg.includes('runway') || msg.includes('receita')) {
    return mrr > 0
      ? `MRR atual: $${mrr.toLocaleString()}. Dispare o agente financeiro para uma análise completa com projeções.`
      : 'Banco de dados vazio. Adicione clientes com MRR para ver projeções financeiras reais.';
  }
  if (msg.includes('contrat')) {
    return 'Adicione contratos com custo atual e taxa de mercado para o agente detectar overpricing automaticamente.';
  }
  return 'Configure ANTHROPIC_API_KEY no Railway para respostas com IA real. Posso ajudar com churn, upsell, finanças e contratos.';
}

export default { callClaude, analyzeChurnWithAI, analyzeUpsellWithAI, analyzeFinancialsWithAI, analyzeContractWithAI, chatWithAI };

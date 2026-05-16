// services/slackService.js
// Envia notificações para Slack quando aprovações são criadas

export async function sendSlackNotification(webhookUrl, message) {
  if (!webhookUrl) return { success: false, error: 'Webhook URL não configurada' };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!res.ok) return { success: false, error: `Slack error: ${res.status}` };
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export function buildApprovalNotification(approval, dashboardUrl = 'https://neuralops-sage.vercel.app') {
  const icons = {
    churn_prediction: '🔴',
    upsell_crosssell: '📈',
    financial_projection: '💰',
    contract_renegotiation: '🤝'
  };

  const actionLabels = {
    apply_discount: 'Email de Retenção',
    send_upsell_offer: 'Proposta de Upsell',
    send_renegotiation_proposal: 'Renegociação de Contrato'
  };

  const icon = icons[approval.agent_type] || '🤖';
  const action = actionLabels[approval.action_type] || approval.action_type;

  return {
    text: `${icon} Nova aprovação pendente no NeuralOps`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${icon} Aprovação Pendente — ${action}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Cliente:*\n${approval.customer_name || approval.vendor_name || '—'}` },
          { type: 'mrkdwn', text: `*Ação:*\n${action}` },
          { type: 'mrkdwn', text: `*Agente:*\n${approval.agent_type || '—'}` },
          { type: 'mrkdwn', text: `*Confiança:*\n${approval.confidence_score ? Math.round(approval.confidence_score * 100) + '%' : '—'}` }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✓ Ver e Aprovar' },
            url: `${dashboardUrl}/dashboard`,
            style: 'primary'
          }
        ]
      }
    ]
  };
}

export function buildAgentCompletedNotification(agentType, result) {
  const labels = {
    churn_prediction: 'Churn Prediction',
    upsell_crosssell: 'Upsell & Cross-sell',
    financial_projection: 'Financial Projection',
    contract_renegotiation: 'Contract Renegotiation'
  };

  return {
    text: `✅ Agente ${labels[agentType] || agentType} concluiu análise`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `✅ *${labels[agentType] || agentType}* concluiu análise\n${result?.decisions_made ? `${result.decisions_made} decisões criadas para aprovação` : 'Análise realizada sem novas ações necessárias'}`
        }
      }
    ]
  };
}

export function isSlackConfigured() {
  return !!process.env.SLACK_WEBHOOK_URL;
}

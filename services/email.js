// services/email.js
// Serviço de email usando Resend API (gratuito: 100 emails/dia)
// Configure RESEND_API_KEY no Railway para ativar emails reais

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'NeuralOps <noreply@neuralops.app>';

/**
 * Envia um email usando Resend API
 * Se não configurado, loga no console e no banco
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log(`📧 [EMAIL SIMULADO - configure RESEND_API_KEY para envio real]`);
    console.log(`   Para: ${to}`);
    console.log(`   Assunto: ${subject}`);
    console.log(`   Conteúdo: ${text || subject}`);
    return { success: true, simulated: true, message: 'Email simulado (RESEND_API_KEY não configurada)' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text: text || subject
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend API error:', data);
      return { success: false, error: data.message || 'Erro ao enviar email' };
    }

    console.log(`✅ Email enviado para ${to}: ${data.id}`);
    return { success: true, id: data.id };
  } catch (error) {
    console.error('Email service error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Template: Email de retenção de cliente em risco de churn
 */
export function buildChurnRetentionEmail({ customerName, riskLevel, retentionMessage, discountPercent, managerName }) {
  const urgencyColor = riskLevel === 'critical' ? '#ff4466' : riskLevel === 'high' ? '#ff9900' : '#00d4ff';
  const subject = riskLevel === 'critical' 
    ? `${customerName}, queremos garantir que você está satisfeito` 
    : `${customerName}, temos algo especial para você`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#05060a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px 40px;border-bottom:1px solid #1e2d42;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#f0f8ff;letter-spacing:-0.5px;">
                N<span style="color:#00d4ff;">euralOps</span>
              </h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;font-size:18px;color:#f0f8ff;font-weight:600;">
                Olá, ${customerName}!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#7a9bb8;line-height:1.7;">
                ${retentionMessage || 'Notamos que você não tem acessado sua conta recentemente e gostaríamos de entender como podemos melhorar sua experiência.'}
              </p>
              ${discountPercent ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.2);border-radius:6px;margin:24px 0;">
                <tr>
                  <td style="padding:24px;text-align:center;">
                    <p style="margin:0 0 8px;font-size:13px;color:#7a9bb8;letter-spacing:1px;text-transform:uppercase;">Oferta Exclusiva para Você</p>
                    <p style="margin:0 0 8px;font-size:40px;font-weight:800;color:#00d4ff;">${discountPercent}% OFF</p>
                    <p style="margin:0;font-size:13px;color:#4a6480;">Nos próximos 3 meses do seu plano</p>
                  </td>
                </tr>
              </table>
              ` : ''}
              <p style="margin:24px 0;font-size:15px;color:#7a9bb8;line-height:1.7;">
                Nosso time está disponível para uma conversa sobre suas necessidades e como podemos entregar mais valor para o seu negócio.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#00d4ff;border-radius:4px;">
                    <a href="mailto:${process.env.SUPPORT_EMAIL || 'suporte@neuralops.app'}" 
                       style="display:inline-block;padding:14px 28px;color:#05060a;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.5px;">
                      Falar com Nossa Equipe
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #1e2d42;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4a6480;">
                © 2026 NeuralOps. Se não quiser mais receber estes emails, 
                <a href="#" style="color:#00d4ff;">clique aqui</a>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: `Olá ${customerName}, ${retentionMessage || 'queremos melhorar sua experiência.'}` };
}

/**
 * Template: Email de oferta de upsell
 */
export function buildUpsellEmail({ customerName, opportunityType, salesPitch, recommendedOffer, estimatedValue }) {
  const subject = `${customerName}, descubra como crescer ainda mais com NeuralOps`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#05060a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px 40px;border-bottom:1px solid #1e2d42;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#f0f8ff;">
                N<span style="color:#00d4ff;">euralOps</span>
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;font-size:13px;color:#00ff88;letter-spacing:1.5px;text-transform:uppercase;">
                ✦ Oportunidade Identificada
              </p>
              <p style="margin:0 0 20px;font-size:20px;color:#f0f8ff;font-weight:700;">
                Olá, ${customerName}!
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#7a9bb8;line-height:1.7;">
                ${salesPitch || 'Identificamos uma oportunidade perfeita para expandir seus resultados com NeuralOps.'}
              </p>
              ${recommendedOffer ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.2);border-radius:6px;margin:24px 0;padding:24px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#4a6480;letter-spacing:1px;text-transform:uppercase;">Oferta Recomendada</p>
                    <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#00ff88;">${recommendedOffer}</p>
                    ${estimatedValue ? `<p style="margin:0;font-size:13px;color:#4a6480;">Valor potencial: $${Number(estimatedValue).toLocaleString()}/ano</p>` : ''}
                  </td>
                </tr>
              </table>
              ` : ''}
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#00ff88;border-radius:4px;">
                    <a href="mailto:${process.env.SUPPORT_EMAIL || 'vendas@neuralops.app'}" 
                       style="display:inline-block;padding:14px 28px;color:#05060a;font-size:14px;font-weight:700;text-decoration:none;">
                      Quero Saber Mais →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #1e2d42;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4a6480;">© 2026 NeuralOps.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: `${customerName}, ${salesPitch}` };
}

/**
 * Template: Email de proposta de renegociação de contrato
 */
export function buildRenegotiationEmail({ vendorName, currentCost, marketRate, savings, negotiationEmail }) {
  const subject = `Proposta de Revisão Contratual — ${vendorName}`;
  
  const emailBody = negotiationEmail || `
Prezado(a) ${vendorName},

Esperamos que esteja bem. Gostaríamos de agendar uma reunião para discutir os termos do nosso contrato atual.

Após uma análise de mercado, identificamos que há oportunidade de otimização nos valores contratuais:
- Custo atual: $${Number(currentCost).toLocaleString()}/ano
- Taxa de mercado: $${Number(marketRate).toLocaleString()}/ano
- Economia potencial: $${Number(savings).toLocaleString()}/ano

Acreditamos que uma revisão seria benéfica para ambas as partes e estamos abertos a discutir alternativas que mantenham a qualidade dos serviços prestados.

Aguardamos o seu retorno para agendar uma conversa.

Atenciosamente,
Time de Procurement — NeuralOps`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#05060a;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px 40px;border-bottom:1px solid #1e2d42;">
              <h1 style="margin:0;font-size:24px;font-weight:800;color:#f0f8ff;">
                N<span style="color:#00d4ff;">euralOps</span>
              </h1>
              <p style="margin:8px 0 0;font-size:13px;color:#4a6480;">Proposta de Renegociação Contratual</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <pre style="margin:0;font-size:14px;color:#b8cfe0;line-height:1.8;white-space:pre-wrap;font-family:inherit;">${emailBody}</pre>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.2);border-radius:6px;">
                <tr>
                  <td style="padding:20px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:12px;color:#4a6480;text-transform:uppercase;letter-spacing:1px;">Economia Anual Potencial</p>
                    <p style="margin:0;font-size:32px;font-weight:800;color:#00d4ff;">$${Number(savings).toLocaleString()}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #1e2d42;text-align:center;">
              <p style="margin:0;font-size:12px;color:#4a6480;">© 2026 NeuralOps.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: emailBody };
}

export default { sendEmail, buildChurnRetentionEmail, buildUpsellEmail, buildRenegotiationEmail };

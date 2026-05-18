// services/email.js — NeuralOps Email Service
// Exporta: sendEmail, buildChurnRetentionEmail, buildUpsellEmail, buildRenegotiationEmail, sendWelcomeEmail

// ── SEND EMAIL ─────────────────────────────────────────
export async function sendEmail({ to, subject, html, text, from }) {
  if (process.env.RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: from || 'NeuralOps <noreply@resend.dev>',
          to: Array.isArray(to) ? to : [to],
          subject: subject || 'Mensagem NeuralOps',
          html: html || `<p>${text || ''}</p>`,
          text: text || ''
        })
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`✉️ Email enviado via Resend para ${to}: ${data.id}`);
        return { success: true, id: data.id, provider: 'resend' };
      }
      console.error('Resend error:', JSON.stringify(data));
    } catch (e) {
      console.error('Resend fetch error:', e.message);
    }
  }
  console.log(`📧 [EMAIL LOG] Para: ${to} | Assunto: ${subject}`);
  return { success: true, provider: 'log' };
}

// ── EMAIL BUILDERS ─────────────────────────────────────

export function buildChurnRetentionEmail({ customerName, riskLevel, retentionMessage, discountPercent, managerName }) {
  const subject = `${customerName}, gostaríamos de conversar sobre sua experiência`;
  const discountHtml = discountPercent
    ? `<div style="background:#0d1420;border:1px solid rgba(0,255,136,.2);border-radius:6px;padding:16px;margin:20px 0;text-align:center;">
        <div style="font-size:11px;color:#6b8aaa;letter-spacing:1px;margin-bottom:4px;">OFERTA ESPECIAL</div>
        <div style="font-size:28px;font-weight:bold;color:#00ff88;">${discountPercent}% de desconto</div>
        <div style="font-size:13px;color:#9ab5cc;">por 3 meses no seu plano atual</div>
       </div>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:40px auto;background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px;border-bottom:1px solid #1e2d42;text-align:center;">
    <h1 style="color:#f5faff;margin:0;font-size:22px;">N<span style="color:#00d4ff;">euralOps</span></h1>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#f5faff;margin:0 0 16px;">Olá, ${customerName}!</h2>
    <p style="color:#9ab5cc;line-height:1.8;margin:0 0 16px;">${retentionMessage || `Notamos que você não está aproveitando ao máximo nossa plataforma. Gostaríamos de entender como podemos melhorar sua experiência.`}</p>
    ${discountHtml}
    <p style="color:#9ab5cc;line-height:1.8;margin:0 0 24px;">Podemos agendar uma conversa rápida? Estamos aqui para ajudar.</p>
    <div style="text-align:center;">
      <a href="mailto:${process.env.ACCOUNT_EMAIL || 'suporte@neuralops.com.br'}" style="background:#00d4ff;color:#05060a;padding:14px 36px;border-radius:4px;font-weight:700;text-decoration:none;display:inline-block;">FALAR COM SUPORTE →</a>
    </div>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #1e2d42;text-align:center;">
    <p style="color:#4a6480;font-size:12px;margin:0;">Enviado por ${managerName || 'Equipe NeuralOps'}</p>
  </div>
</div></body></html>`;

  const text = `Olá ${customerName},\n\n${retentionMessage || 'Notamos que você não está aproveitando ao máximo nossa plataforma.'}\n\n${discountPercent ? `Oferta especial: ${discountPercent}% de desconto por 3 meses.\n\n` : ''}Podemos agendar uma conversa?\n\nEquipe ${managerName || 'NeuralOps'}`;

  return { subject, html, text };
}

export function buildUpsellEmail({ customerName, opportunityType, salesPitch, recommendedOffer, estimatedValue }) {
  const subject = `${customerName}, temos uma proposta especial para você`;
  const valueHtml = estimatedValue
    ? `<div style="background:#0d1420;border:1px solid rgba(0,212,255,.2);border-radius:6px;padding:16px;margin:20px 0;text-align:center;">
        <div style="font-size:11px;color:#6b8aaa;letter-spacing:1px;margin-bottom:4px;">VALOR ESTIMADO</div>
        <div style="font-size:28px;font-weight:bold;color:#00d4ff;">R$${Number(estimatedValue).toLocaleString('pt-BR')}</div>
        <div style="font-size:13px;color:#9ab5cc;">em ganhos adicionais por ano</div>
       </div>`
    : '';

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:40px auto;background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px;border-bottom:1px solid #1e2d42;text-align:center;">
    <h1 style="color:#f5faff;margin:0;font-size:22px;">N<span style="color:#00d4ff;">euralOps</span></h1>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#f5faff;margin:0 0 16px;">Olá, ${customerName}! 🚀</h2>
    <p style="color:#9ab5cc;line-height:1.8;margin:0 0 16px;">${salesPitch || `Você tem usado muito bem nossa plataforma e identificamos uma oportunidade de crescimento para o seu negócio.`}</p>
    ${valueHtml}
    ${recommendedOffer ? `<div style="background:#0d1420;border-left:3px solid #00d4ff;padding:16px;margin:16px 0;"><p style="color:#cce0f0;margin:0;">${recommendedOffer}</p></div>` : ''}
    <div style="text-align:center;margin-top:24px;">
      <a href="mailto:${process.env.ACCOUNT_EMAIL || 'suporte@neuralops.com.br'}" style="background:#00d4ff;color:#05060a;padding:14px 36px;border-radius:4px;font-weight:700;text-decoration:none;display:inline-block;">QUERO SABER MAIS →</a>
    </div>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #1e2d42;text-align:center;">
    <p style="color:#4a6480;font-size:12px;margin:0;">Equipe NeuralOps</p>
  </div>
</div></body></html>`;

  const text = `Olá ${customerName},\n\n${salesPitch || 'Identificamos uma oportunidade de crescimento para o seu negócio.'}\n\n${recommendedOffer || ''}\n\nResponda este email para saber mais.\n\nEquipe NeuralOps`;

  return { subject, html, text };
}

export function buildRenegotiationEmail({ vendorName, currentCost, marketRate, savings, negotiationEmail }) {
  const subject = `Proposta de revisão contratual — ${vendorName}`;

  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:40px auto;background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#0d1420,#111827);padding:32px;border-bottom:1px solid #1e2d42;text-align:center;">
    <h1 style="color:#f5faff;margin:0;font-size:22px;">N<span style="color:#00d4ff;">euralOps</span></h1>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#f5faff;margin:0 0 16px;">Prezado(a) ${vendorName},</h2>
    <p style="color:#9ab5cc;line-height:1.8;margin:0 0 16px;">${negotiationEmail || `Gostaríamos de revisar os termos do nosso contrato atual. Nossa análise indica que os valores estão acima da taxa de mercado para serviços similares.`}</p>
    ${currentCost || marketRate ? `
    <div style="background:#0d1420;border-radius:6px;padding:20px;margin:20px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#6b8aaa;font-size:13px;">Custo atual:</span>
        <span style="color:#ff4466;font-size:13px;font-weight:bold;">R$${Number(currentCost||0).toLocaleString('pt-BR')}/ano</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#6b8aaa;font-size:13px;">Taxa de mercado:</span>
        <span style="color:#cce0f0;font-size:13px;">R$${Number(marketRate||0).toLocaleString('pt-BR')}/ano</span>
      </div>
      ${savings ? `<div style="border-top:1px solid #1e2d42;padding-top:12px;display:flex;justify-content:space-between;">
        <span style="color:#6b8aaa;font-size:13px;">Economia potencial:</span>
        <span style="color:#00ff88;font-size:15px;font-weight:bold;">R$${Number(savings).toLocaleString('pt-BR')}/ano</span>
      </div>` : ''}
    </div>` : ''}
    <p style="color:#9ab5cc;line-height:1.8;">Solicitamos uma reunião para discutir um ajuste benéfico para ambas as partes. Por favor, entre em contato para agendar.</p>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #1e2d42;text-align:center;">
    <p style="color:#4a6480;font-size:12px;margin:0;">Equipe NeuralOps</p>
  </div>
</div></body></html>`;

  const text = `Prezado(a) ${vendorName},\n\n${negotiationEmail || 'Gostaríamos de revisar os termos do nosso contrato.'}\n\nCusto atual: R$${Number(currentCost||0).toLocaleString('pt-BR')}/ano\nTaxa de mercado: R$${Number(marketRate||0).toLocaleString('pt-BR')}/ano\n${savings ? `Economia potencial: R$${Number(savings).toLocaleString('pt-BR')}/ano\n` : ''}\nEquipe NeuralOps`;

  return { subject, html, text };
}

export async function sendWelcomeEmail({ name, email, password, loginUrl }) {
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:40px auto;background:#111827;border:1px solid #1e2d42;border-radius:8px;overflow:hidden;">
  <div style="padding:32px;border-bottom:1px solid #1e2d42;text-align:center;">
    <h1 style="color:#f5faff;margin:0;font-size:24px;">N<span style="color:#00d4ff;">euralOps</span></h1>
  </div>
  <div style="padding:32px;">
    <h2 style="color:#f5faff;margin:0 0 16px;">Bem-vindo, ${name}! 🚀</h2>
    <p style="color:#9ab5cc;margin:0 0 24px;">Sua conta foi criada. Aqui estão seus dados de acesso:</p>
    <div style="background:#0d1420;border-radius:6px;padding:20px;margin-bottom:24px;">
      <p style="color:#6b8aaa;font-size:11px;margin:0 0 4px;letter-spacing:1px;">EMAIL</p>
      <p style="color:#00d4ff;font-family:monospace;margin:0 0 14px;">${email}</p>
      <p style="color:#6b8aaa;font-size:11px;margin:0 0 4px;letter-spacing:1px;">SENHA TEMPORÁRIA</p>
      <p style="color:#00ff88;font-family:monospace;font-size:18px;margin:0;">${password}</p>
    </div>
    <div style="text-align:center;">
      <a href="${loginUrl}/login" style="background:#00d4ff;color:#05060a;padding:14px 36px;border-radius:4px;font-weight:700;text-decoration:none;display:inline-block;">ACESSAR PLATAFORMA →</a>
    </div>
  </div>
</div></body></html>`;
  return sendEmail({ to: email, subject: `Bem-vindo ao NeuralOps, ${name}!`, html });
}

export default { sendEmail, buildChurnRetentionEmail, buildUpsellEmail, buildRenegotiationEmail, sendWelcomeEmail };

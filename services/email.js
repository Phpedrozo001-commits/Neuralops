// services/email.js — NeuralOps Email Service
// Serviço de envio de emails via Resend ou fallback de log

export async function sendEmail({ to, subject, html, text, from }) {
  // Se Resend estiver configurado, usa ele
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
      console.error('Resend error:', data);
    } catch (e) {
      console.error('Resend fetch error:', e.message);
    }
  }

  // Fallback: loga no console (Railway mostra nos logs)
  console.log(`📧 [EMAIL LOG] Para: ${to} | Assunto: ${subject}`);
  return { success: true, provider: 'log' };
}

export async function sendWelcomeEmail({ name, email, password, loginUrl }) {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#05060a;font-family:Arial,sans-serif;">
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
          <p style="color:#6b8aaa;font-size:11px;margin:0 0 4px;letter-spacing:1px;">SENHA</p>
          <p style="color:#00ff88;font-family:monospace;font-size:18px;margin:0;">${password}</p>
        </div>
        <div style="text-align:center;">
          <a href="${loginUrl}/login" style="background:#00d4ff;color:#05060a;padding:14px 36px;border-radius:4px;font-weight:700;text-decoration:none;display:inline-block;">ACESSAR PLATAFORMA →</a>
        </div>
      </div>
    </div>
    </body>
    </html>
  `;
  return sendEmail({ to: email, subject: `Bem-vindo ao NeuralOps, ${name}!`, html });
}

export default { sendEmail, sendWelcomeEmail };

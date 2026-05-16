// services/whatsappService.js
// Envia mensagens WhatsApp via Z-API (https://z-api.io)
// Configure: ZAPI_INSTANCE_ID, ZAPI_TOKEN

const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const BASE_URL = ZAPI_INSTANCE
  ? `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}`
  : null;

/**
 * Envia mensagem de texto simples via WhatsApp
 */
export async function sendWhatsAppMessage(phone, message) {
  if (!BASE_URL) return { success: false, error: 'Z-API não configurada' };

  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

  try {
    const res = await fetch(`${BASE_URL}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phoneWithCountry, message })
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Z-API error: ${err}` };
    }

    const data = await res.json();
    return { success: true, messageId: data.messageId || data.id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Envia mensagem de retenção de churn via WhatsApp
 */
export async function sendChurnRetentionWhatsApp(phone, customerName, message, discountPercent) {
  const text = `Olá, ${customerName}! 👋\n\n${message}${discountPercent ? `\n\n🎁 *Oferta especial: ${discountPercent}% de desconto* por tempo limitado.` : ''}\n\nResponda esta mensagem para falar com nossa equipe.`;
  return sendWhatsAppMessage(phone, text);
}

/**
 * Envia proposta de upsell via WhatsApp
 */
export async function sendUpsellWhatsApp(phone, customerName, pitch, offer) {
  const text = `Olá, ${customerName}! 🚀\n\n${pitch}${offer ? `\n\n✨ *${offer}*` : ''}\n\nInteressado? Responda aqui!`;
  return sendWhatsAppMessage(phone, text);
}

/**
 * Verifica status da conexão Z-API
 */
export async function checkZAPIStatus() {
  if (!BASE_URL) return { connected: false, error: 'Z-API não configurada' };

  try {
    const res = await fetch(`${BASE_URL}/status`, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) return { connected: false, error: `Status ${res.status}` };
    const data = await res.json();
    return { connected: data.connected || false, phone: data.phone };
  } catch (e) {
    return { connected: false, error: e.message };
  }
}

export function isWhatsAppConfigured() {
  return !!(ZAPI_INSTANCE && ZAPI_TOKEN);
}

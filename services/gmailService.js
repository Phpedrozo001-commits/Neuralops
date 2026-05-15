// services/gmailService.js
// Cada cliente conecta o próprio Gmail via OAuth
// Emails saem do email do próprio cliente

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.VERCEL_URL 
  ? `https://${process.env.VERCEL_URL}` 
  : (process.env.BASE_URL || 'http://localhost:3001');

const REDIRECT_URI = `${BASE_URL}/api/auth/gmail/callback`;
const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email'
].join(' ');

/**
 * Gera a URL de autorização do Google OAuth
 */
export function getGoogleAuthUrl(userId) {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID não configurado');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: String(userId)
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Troca o código de autorização por tokens de acesso
 */
export async function exchangeCodeForTokens(code) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
      code
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OAuth token exchange failed: ${err}`);
  }

  return response.json();
}

/**
 * Renova o access token usando o refresh token
 */
export async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  return response.json();
}

/**
 * Busca o email do usuário autenticado
 */
export async function getGoogleUserEmail(accessToken) {
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) throw new Error('Failed to get user info');
  const data = await response.json();
  return data.email;
}

/**
 * Envia email via Gmail API usando o token do cliente
 */
export async function sendEmailViaGmail(accessToken, { to, subject, html, text }) {
  // Monta o email no formato RFC 2822
  const emailLines = [
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html || text || subject
  ];

  const rawEmail = emailLines.join('\r\n');
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encodedEmail })
  });

  if (!response.ok) {
    const err = await response.json();
    
    // Token expirado
    if (err.error?.code === 401) {
      throw new Error('TOKEN_EXPIRED');
    }
    
    throw new Error(`Gmail send failed: ${JSON.stringify(err)}`);
  }

  const result = await response.json();
  return { success: true, messageId: result.id };
}

/**
 * Envia email usando os tokens salvos do usuário
 * Renova automaticamente se expirado
 */
export async function sendEmailForUser(db, userId, emailData) {
  // Busca conexão do usuário
  const connection = await db.get(
    'SELECT * FROM email_connections WHERE user_id = ?',
    [userId]
  );

  if (!connection) {
    return { success: false, error: 'Gmail não conectado. Configure na seção Email do dashboard.' };
  }

  let accessToken = connection.access_token;

  // Verifica se o token expirou
  const expiry = new Date(connection.token_expiry);
  const now = new Date();
  
  if (now >= expiry) {
    try {
      // Renova o token
      const newTokens = await refreshAccessToken(connection.refresh_token);
      accessToken = newTokens.access_token;
      
      const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);
      
      await db.run(
        'UPDATE email_connections SET access_token = ?, token_expiry = ?, updated_at = ? WHERE user_id = ?',
        [accessToken, newExpiry.toISOString(), new Date().toISOString(), userId]
      );
    } catch (err) {
      return { success: false, error: 'Token Gmail expirado. Reconecte o Gmail no dashboard.' };
    }
  }

  try {
    const result = await sendEmailViaGmail(accessToken, emailData);
    console.log(`✉️ Email enviado via Gmail de ${connection.email_address} para ${emailData.to}`);
    return { success: true, ...result, sentFrom: connection.email_address };
  } catch (err) {
    if (err.message === 'TOKEN_EXPIRED') {
      // Tenta renovar uma vez
      try {
        const newTokens = await refreshAccessToken(connection.refresh_token);
        const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);
        
        await db.run(
          'UPDATE email_connections SET access_token = ?, token_expiry = ?, updated_at = ? WHERE user_id = ?',
          [newTokens.access_token, newExpiry.toISOString(), new Date().toISOString(), userId]
        );
        
        const result = await sendEmailViaGmail(newTokens.access_token, emailData);
        return { success: true, ...result, sentFrom: connection.email_address };
      } catch {
        return { success: false, error: 'Sessão Gmail expirada. Reconecte no dashboard.' };
      }
    }
    return { success: false, error: err.message };
  }
}

export default {
  getGoogleAuthUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getGoogleUserEmail,
  sendEmailViaGmail,
  sendEmailForUser
};

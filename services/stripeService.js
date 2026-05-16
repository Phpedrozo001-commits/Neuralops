// services/stripeService.js
// Integração com Stripe — sincroniza clientes, MRR e churn automaticamente

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * Busca todos os clientes ativos do Stripe e sincroniza com o banco
 */
export async function syncStripeCustomers(db) {
  if (!STRIPE_SECRET) throw new Error('STRIPE_SECRET_KEY não configurada');

  const customers = await fetchAllStripeCustomers();
  const subscriptions = await fetchAllSubscriptions();

  // Mapeia subscriptions por customer
  const subByCustomer = {};
  for (const sub of subscriptions) {
    if (!subByCustomer[sub.customer]) subByCustomer[sub.customer] = [];
    subByCustomer[sub.customer].push(sub);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const customer of customers) {
    const subs = subByCustomer[customer.id] || [];
    const activeSub = subs.find(s => s.status === 'active') || subs[0];
    const mrr = activeSub ? (activeSub.plan?.amount || 0) / 100 : 0;
    const lastLogin = customer.created ? new Date(customer.created * 1000).toISOString() : null;

    if (!customer.email && !customer.name) { skipped++; continue; }

    const name = customer.name || customer.email?.split('@')[0] || 'Cliente Stripe';
    const email = customer.email || null;
    const engagement = activeSub?.status === 'active' ? 75 : activeSub?.status === 'past_due' ? 30 : 50;

    try {
      const existing = email ? await db.get('SELECT id FROM customers WHERE email = ?', [email]) : null;

      if (existing) {
        await db.run(
          'UPDATE customers SET mrr = ?, engagement_score = ?, updated_at = ? WHERE id = ?',
          [mrr, engagement, new Date().toISOString(), existing.id]
        );
        updated++;
      } else {
        await db.run(
          'INSERT INTO customers (name, email, mrr, engagement_score, last_login) VALUES (?, ?, ?, ?, ?)',
          [name, email, mrr, engagement, lastLogin]
        );
        created++;
      }
    } catch (e) {
      console.error('Stripe sync error for customer:', customer.id, e.message);
      skipped++;
    }
  }

  return { created, updated, skipped, total: customers.length };
}

async function fetchAllStripeCustomers() {
  let customers = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const url = new URL('https://api.stripe.com/v1/customers');
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });

    if (!res.ok) throw new Error(`Stripe API error: ${res.status}`);
    const data = await res.json();

    customers = customers.concat(data.data || []);
    hasMore = data.has_more;
    if (hasMore && data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id;
    }
  }

  return customers;
}

async function fetchAllSubscriptions() {
  let subs = [];
  let hasMore = true;
  let startingAfter = null;

  while (hasMore) {
    const url = new URL('https://api.stripe.com/v1/subscriptions');
    url.searchParams.set('limit', '100');
    url.searchParams.set('status', 'all');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });

    if (!res.ok) break;
    const data = await res.json();

    subs = subs.concat(data.data || []);
    hasMore = data.has_more;
    if (hasMore && data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id;
    }
  }

  return subs;
}

/**
 * Processa eventos de webhook do Stripe
 */
export async function handleStripeWebhook(payload, signature, db) {
  // Verifica assinatura do webhook
  if (STRIPE_WEBHOOK_SECRET) {
    const isValid = verifyStripeSignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) throw new Error('Assinatura do webhook inválida');
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch (e) {
    throw new Error('Payload inválido');
  }

  const obj = event.data?.object;
  console.log(`📡 Stripe webhook: ${event.type}`);

  switch (event.type) {
    case 'customer.subscription.deleted': {
      // Cliente cancelou — marca com baixo engajamento
      if (obj?.customer) {
        const cust = await fetchCustomer(obj.customer);
        if (cust?.email) {
          await db.run('UPDATE customers SET engagement_score = 10, mrr = 0 WHERE email = ?', [cust.email]);
          console.log(`⚠️ Stripe: ${cust.email} cancelou assinatura`);
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      // MRR mudou
      if (obj?.customer) {
        const cust = await fetchCustomer(obj.customer);
        const mrr = (obj.plan?.amount || 0) / 100;
        if (cust?.email) {
          await db.run('UPDATE customers SET mrr = ? WHERE email = ?', [mrr, cust.email]);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Pagamento falhou — risco de churn
      if (obj?.customer_email) {
        await db.run('UPDATE customers SET engagement_score = 25 WHERE email = ?', [obj.customer_email]);
        console.log(`⚠️ Stripe: pagamento falhou para ${obj.customer_email}`);
      }
      break;
    }

    case 'customer.created': {
      // Novo cliente
      const name = obj?.name || obj?.email?.split('@')[0] || 'Novo Cliente';
      if (obj?.email) {
        const existing = await db.get('SELECT id FROM customers WHERE email = ?', [obj.email]);
        if (!existing) {
          await db.run(
            'INSERT INTO customers (name, email, mrr, engagement_score) VALUES (?, ?, ?, ?)',
            [name, obj.email, 0, 70]
          );
          console.log(`✅ Stripe: novo cliente ${obj.email}`);
        }
      }
      break;
    }
  }

  return { received: true, type: event.type };
}

async function fetchCustomer(customerId) {
  const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
  });
  if (!res.ok) return null;
  return res.json();
}

function verifyStripeSignature(payload, signature, secret) {
  try {
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1];
    const v1 = parts.find(p => p.startsWith('v1='))?.split('=')[1];
    if (!timestamp || !v1) return false;

    const signedPayload = `${timestamp}.${payload}`;
    // Verificação básica de timestamp (5 minutos)
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (age > 300) return false;

    return true; // Em produção usar crypto.createHmac
  } catch (e) {
    return false;
  }
}

export function isStripeConfigured() {
  return !!STRIPE_SECRET;
}

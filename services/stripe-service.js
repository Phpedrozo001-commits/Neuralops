import Stripe from 'stripe';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getDatabase } from '../config/database.js';

// ============================================
// STRIPE INITIALIZATION
// ============================================
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

/**
 * Create a Stripe customer
 */
export async function createStripeCustomer(user) {
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user.id,
      },
    });

    logger.info('Stripe customer created', { userId: user.id, stripeCustomerId: customer.id });
    return customer;
  } catch (error) {
    logger.error('Failed to create Stripe customer', { error: error.message });
    throw error;
  }
}

/**
 * Create a subscription
 */
export async function createSubscription(userId, planId, stripeCustomerId) {
  const db = await getDatabase();

  try {
    // Get plan details
    const plan = await db.get('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plan) {
      throw new Error('Plan not found');
    }

    // Create subscription in Stripe
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [
        {
          price: plan.stripe_price_id,
        },
      ],
      metadata: {
        userId,
        planId,
      },
    });

    // Save subscription to database
    await db.run(
      `INSERT INTO subscriptions (user_id, plan_id, stripe_subscription_id, status, current_period_start, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        planId,
        subscription.id,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
      ]
    );

    logger.info('Subscription created', { userId, planId, stripeSubscriptionId: subscription.id });
    return subscription;
  } catch (error) {
    logger.error('Failed to create subscription', { error: error.message });
    throw error;
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(stripeSubscriptionId) {
  const db = await getDatabase();

  try {
    const subscription = await stripe.subscriptions.del(stripeSubscriptionId);

    // Update database
    await db.run(
      `UPDATE subscriptions SET status = ?, canceled_at = CURRENT_TIMESTAMP WHERE stripe_subscription_id = ?`,
      [subscription.status, stripeSubscriptionId]
    );

    logger.info('Subscription canceled', { stripeSubscriptionId });
    return subscription;
  } catch (error) {
    logger.error('Failed to cancel subscription', { error: error.message });
    throw error;
  }
}

/**
 * Update subscription plan
 */
export async function updateSubscriptionPlan(stripeSubscriptionId, newPriceId) {
  try {
    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

    const updatedSubscription = await stripe.subscriptions.update(stripeSubscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ],
    });

    logger.info('Subscription plan updated', { stripeSubscriptionId });
    return updatedSubscription;
  } catch (error) {
    logger.error('Failed to update subscription plan', { error: error.message });
    throw error;
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(stripeSubscriptionId) {
  try {
    return await stripe.subscriptions.retrieve(stripeSubscriptionId);
  } catch (error) {
    logger.error('Failed to get subscription', { error: error.message });
    throw error;
  }
}

/**
 * Create payment intent for one-time payment
 */
export async function createPaymentIntent(amount, currency = 'usd', metadata = {}) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      metadata,
    });

    logger.info('Payment intent created', { paymentIntentId: paymentIntent.id });
    return paymentIntent;
  } catch (error) {
    logger.error('Failed to create payment intent', { error: error.message });
    throw error;
  }
}

/**
 * Retrieve invoice
 */
export async function getInvoice(invoiceId) {
  try {
    return await stripe.invoices.retrieve(invoiceId);
  } catch (error) {
    logger.error('Failed to retrieve invoice', { error: error.message });
    throw error;
  }
}

/**
 * List invoices for customer
 */
export async function listInvoices(stripeCustomerId, limit = 10) {
  try {
    return await stripe.invoices.list({
      customer: stripeCustomerId,
      limit,
    });
  } catch (error) {
    logger.error('Failed to list invoices', { error: error.message });
    throw error;
  }
}

/**
 * Handle Stripe webhook event
 */
export async function handleWebhookEvent(event) {
  const db = await getDatabase();

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object, db);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object, db);
        break;

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object, db);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object, db);
        break;

      default:
        logger.info('Unhandled webhook event', { type: event.type });
    }

    return { received: true };
  } catch (error) {
    logger.error('Webhook event handling failed', { error: error.message, eventType: event.type });
    throw error;
  }
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription, db) {
  await db.run(
    `UPDATE subscriptions 
     SET status = ?, current_period_start = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = ?`,
    [
      subscription.status,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      subscription.id,
    ]
  );

  logger.info('Subscription updated', { stripeSubscriptionId: subscription.id, status: subscription.status });
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription, db) {
  await db.run(
    `UPDATE subscriptions 
     SET status = ?, canceled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE stripe_subscription_id = ?`,
    [subscription.status, subscription.id]
  );

  logger.info('Subscription deleted', { stripeSubscriptionId: subscription.id });
}

/**
 * Handle invoice payment succeeded event
 */
async function handleInvoicePaymentSucceeded(invoice, db) {
  const subscription = await db.get(
    'SELECT id FROM subscriptions WHERE stripe_subscription_id = ?',
    [invoice.subscription]
  );

  if (subscription) {
    await db.run(
      `INSERT INTO billing_history (user_id, subscription_id, stripe_invoice_id, amount, currency, status, invoice_url, paid_at)
       SELECT user_id, ?, ?, ?, ?, ?, ?, ?
       FROM subscriptions WHERE id = ?`,
      [
        subscription.id,
        invoice.id,
        invoice.amount_paid / 100, // Convert from cents
        invoice.currency,
        invoice.status,
        invoice.hosted_invoice_url,
        new Date(invoice.paid_at * 1000),
        subscription.id,
      ]
    );

    logger.info('Invoice payment recorded', { invoiceId: invoice.id, amount: invoice.amount_paid });
  }
}

/**
 * Handle invoice payment failed event
 */
async function handleInvoicePaymentFailed(invoice, db) {
  logger.warn('Invoice payment failed', { invoiceId: invoice.id, customerId: invoice.customer });

  // Could send email notification here
}

export default {
  stripe,
  createStripeCustomer,
  createSubscription,
  cancelSubscription,
  updateSubscriptionPlan,
  getSubscription,
  createPaymentIntent,
  getInvoice,
  listInvoices,
  handleWebhookEvent,
};

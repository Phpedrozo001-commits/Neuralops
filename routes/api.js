import express from 'express';
import { authMiddleware, requireRole, loginUser, registerUser, validatePasswordStrength } from '../middleware/auth.js';
import { authLimiter, approvalLimiter, agentLimiter, csrfProtection, generateCSRFToken } from '../middleware/security-improved.js';
import { getDatabase } from '../config/database.js';
import logger from '../config/logger.js';
import * as stripeService from '../services/stripe-service.js';
import * as cacheService from '../services/cache-service.js';
import { addBreadcrumb, setUserContext } from '../services/sentry-service.js';

const router = express.Router();

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', async (req, res) => {
  try {
    const db = await getDatabase();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message,
    });
  }
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Register
router.post('/auth/register', authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: 'Password does not meet requirements',
        details: passwordValidation.errors,
      });
    }

    const result = await registerUser(email, password, name);

    if (!result.success) {
      addBreadcrumb('Registration failed', 'auth', 'warning', { email, reason: result.error });
      return res.status(400).json({ error: result.error });
    }

    setUserContext(result.user.id, result.user.email, result.user.name);
    addBreadcrumb('User registered', 'auth', 'info', { userId: result.user.id });

    res.status(201).json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    logger.error('Registration error', { error: error.message });
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await loginUser(email, password);

    if (!result.success) {
      addBreadcrumb('Login failed', 'auth', 'warning', { email });
      return res.status(401).json({ error: result.error });
    }

    setUserContext(result.user.id, result.user.email);
    addBreadcrumb('User logged in', 'auth', 'info', { userId: result.user.id });

    res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get CSRF Token
router.get('/auth/csrf-token', (req, res) => {
  const sessionId = req.user?.userId || req.ip;
  const token = generateCSRFToken(sessionId);
  res.json({ token });
});

// ============================================
// USER ROUTES
// ============================================

// Get current user
router.get('/users/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const user = await db.get('SELECT id, email, name, role FROM users WHERE id = ?', [req.user.userId]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    logger.error('Get user error', { error: error.message });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user profile
router.put('/users/me', authMiddleware, csrfProtection, async (req, res) => {
  try {
    const { name } = req.body;
    const db = await getDatabase();

    await db.run('UPDATE users SET name = ? WHERE id = ?', [name, req.user.userId]);

    addBreadcrumb('User profile updated', 'user', 'info', { userId: req.user.userId });

    res.json({ success: true, message: 'Profile updated' });
  } catch (error) {
    logger.error('Update user error', { error: error.message });
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================
// SUBSCRIPTION ROUTES
// ============================================

// Get subscription
router.get('/subscriptions/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const subscription = await db.get(
      `SELECT s.*, p.name as plan_name, p.price_monthly, p.features
       FROM subscriptions s
       LEFT JOIN plans p ON s.plan_id = p.id
       WHERE s.user_id = ?`,
      [req.user.userId]
    );

    if (!subscription) {
      return res.json({ subscription: null, plan: null });
    }

    res.json(subscription);
  } catch (error) {
    logger.error('Get subscription error', { error: error.message });
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// Get all plans
router.get('/plans', async (req, res) => {
  try {
    const db = await getDatabase();
    const plans = await db.all('SELECT * FROM plans WHERE is_active = true ORDER BY price_monthly ASC');
    res.json(plans);
  } catch (error) {
    logger.error('Get plans error', { error: error.message });
    res.status(500).json({ error: 'Failed to get plans' });
  }
});

// Create checkout session
router.post('/subscriptions/checkout', authMiddleware, csrfProtection, async (req, res) => {
  try {
    const { planId } = req.body;
    const db = await getDatabase();

    // Get user
    const user = await db.get('SELECT id, email, name FROM users WHERE id = ?', [req.user.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get plan
    const plan = await db.get('SELECT * FROM plans WHERE id = ?', [planId]);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found' });
    }

    // Create or get Stripe customer
    let stripeCustomerId = await cacheService.get(`stripe_customer_${user.id}`);
    
    if (!stripeCustomerId) {
      const customer = await stripeService.createStripeCustomer(user);
      stripeCustomerId = customer.id;
      await cacheService.set(`stripe_customer_${user.id}`, stripeCustomerId, 86400 * 30); // 30 days
    }

    // Create subscription
    const subscription = await stripeService.createSubscription(user.id, planId, stripeCustomerId);

    addBreadcrumb('Checkout session created', 'subscription', 'info', { userId: user.id, planId });

    res.json({
      success: true,
      subscription: subscription.id,
      clientSecret: subscription.client_secret,
    });
  } catch (error) {
    logger.error('Checkout error', { error: error.message });
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Cancel subscription
router.post('/subscriptions/cancel', authMiddleware, csrfProtection, async (req, res) => {
  try {
    const db = await getDatabase();
    const subscription = await db.get(
      'SELECT stripe_subscription_id FROM subscriptions WHERE user_id = ? AND status = ?',
      [req.user.userId, 'active']
    );

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    await stripeService.cancelSubscription(subscription.stripe_subscription_id);

    addBreadcrumb('Subscription canceled', 'subscription', 'info', { userId: req.user.userId });

    res.json({ success: true, message: 'Subscription canceled' });
  } catch (error) {
    logger.error('Cancel subscription error', { error: error.message });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ============================================
// USAGE TRACKING
// ============================================

// Get usage
router.get('/usage/me', authMiddleware, async (req, res) => {
  try {
    const db = await getDatabase();
    const usage = await db.all(
      `SELECT metric_name, SUM(quantity) as total
       FROM usage_logs
       WHERE user_id = ? AND period_start >= date('now', '-30 days')
       GROUP BY metric_name`,
      [req.user.userId]
    );

    res.json(usage);
  } catch (error) {
    logger.error('Get usage error', { error: error.message });
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

// Record usage
router.post('/usage/track', authMiddleware, csrfProtection, async (req, res) => {
  try {
    const { metricName, quantity = 1 } = req.body;
    const db = await getDatabase();

    await db.run(
      `INSERT INTO usage_logs (user_id, metric_name, quantity, period_start, period_end)
       VALUES (?, ?, ?, date('now'), date('now', '+30 days'))`,
      [req.user.userId, metricName, quantity]
    );

    res.json({ success: true });
  } catch (error) {
    logger.error('Track usage error', { error: error.message });
    res.status(500).json({ error: 'Failed to track usage' });
  }
});

// ============================================
// ADMIN ROUTES
// ============================================

// Get all users (admin only)
router.get('/admin/users', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDatabase();
    const users = await db.all(
      'SELECT id, email, name, role, created_at, last_login FROM users ORDER BY created_at DESC'
    );

    res.json(users);
  } catch (error) {
    logger.error('Get users error', { error: error.message });
    res.status(500).json({ error: 'Failed to get users' });
  }
});

// Get dashboard metrics (admin only)
router.get('/admin/metrics', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDatabase();

    const totalUsers = await db.get('SELECT COUNT(*) as count FROM users');
    const activeSubscriptions = await db.get(
      "SELECT COUNT(*) as count FROM subscriptions WHERE status = 'active'"
    );
    const totalRevenue = await db.get(
      'SELECT SUM(amount) as total FROM billing_history WHERE status = ? ORDER BY created_at DESC LIMIT 30',
      ['succeeded']
    );

    res.json({
      totalUsers: totalUsers.count,
      activeSubscriptions: activeSubscriptions.count,
      totalRevenue: totalRevenue.total || 0,
    });
  } catch (error) {
    logger.error('Get metrics error', { error: error.message });
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

// ============================================
// AGENT ROUTES
// ============================================

// Trigger agent
router.post('/agents/:agentType/trigger', authMiddleware, requireRole('admin'), agentLimiter, csrfProtection, async (req, res) => {
  try {
    const { agentType } = req.params;
    const db = await getDatabase();

    // Log agent execution
    await db.run(
      `INSERT INTO agent_executions (user_id, agent_type, execution_status, started_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [req.user.userId, agentType, 'started']
    );

    addBreadcrumb(`Agent triggered: ${agentType}`, 'agent', 'info', { userId: req.user.userId });

    res.json({ success: true, message: `${agentType} agent triggered` });
  } catch (error) {
    logger.error('Trigger agent error', { error: error.message });
    res.status(500).json({ error: 'Failed to trigger agent' });
  }
});

// Get agent status
router.get('/agents/:agentType/status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { agentType } = req.params;
    const db = await getDatabase();

    const status = await db.get(
      'SELECT * FROM agent_executions WHERE agent_type = ? ORDER BY created_at DESC LIMIT 1',
      [agentType]
    );

    res.json(status || { status: 'never_run' });
  } catch (error) {
    logger.error('Get agent status error', { error: error.message });
    res.status(500).json({ error: 'Failed to get agent status' });
  }
});

// ============================================
// APPROVAL ROUTES
// ============================================

// Get pending approvals
router.get('/approvals', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const db = await getDatabase();
    const approvals = await db.all(
      `SELECT a.*, c.name as customer_name, ct.vendor_name
       FROM approvals a
       LEFT JOIN customers c ON a.customer_id = c.id
       LEFT JOIN contracts ct ON a.contract_id = ct.id
       WHERE a.user_id = ? AND a.status = 'pending' AND a.expires_at > CURRENT_TIMESTAMP
       ORDER BY a.created_at DESC`,
      [req.user.userId]
    );

    res.json(approvals);
  } catch (error) {
    logger.error('Get approvals error', { error: error.message });
    res.status(500).json({ error: 'Failed to get approvals' });
  }
});

// Approve decision
router.post('/approvals/:approvalId/approve', authMiddleware, requireRole('admin'), approvalLimiter, csrfProtection, async (req, res) => {
  try {
    const { approvalId } = req.params;
    const db = await getDatabase();

    await db.run(
      `UPDATE approvals SET status = ?, approved_by = ? WHERE id = ?`,
      ['approved', req.user.email, approvalId]
    );

    addBreadcrumb('Approval approved', 'approval', 'info', { approvalId });

    res.json({ success: true, message: 'Approval approved' });
  } catch (error) {
    logger.error('Approve decision error', { error: error.message });
    res.status(500).json({ error: 'Failed to approve decision' });
  }
});

// Reject decision
router.post('/approvals/:approvalId/reject', authMiddleware, requireRole('admin'), approvalLimiter, csrfProtection, async (req, res) => {
  try {
    const { approvalId } = req.params;
    const { reason } = req.body;
    const db = await getDatabase();

    await db.run(
      `UPDATE approvals SET status = ?, rejected_reason = ? WHERE id = ?`,
      ['rejected', reason, approvalId]
    );

    addBreadcrumb('Approval rejected', 'approval', 'info', { approvalId });

    res.json({ success: true, message: 'Approval rejected' });
  } catch (error) {
    logger.error('Reject decision error', { error: error.message });
    res.status(500).json({ error: 'Failed to reject decision' });
  }
});

export default router;

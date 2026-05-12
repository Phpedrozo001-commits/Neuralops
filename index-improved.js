import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import env from './config/env.js';
import logger from './config/logger.js';
import { initializeDatabase, closeDatabase, healthCheck } from './config/database.js';
import { initializeCache, closeCache } from './services/cache-service.js';
import { initializeSentry, attachSentryErrorHandler } from './services/sentry-service.js';
import {
  securityHeaders,
  corsConfig,
  generalLimiter,
  requestLogger,
  errorHandler,
} from './middleware/security-improved.js';
import apiRoutes from './routes/api.js';

// Load environment variables
dotenv.config();

const app = express();

// ============================================
// MIDDLEWARE SETUP
// ============================================

// Initialize Sentry (error tracking)
initializeSentry(app);

// Security headers
app.use(securityHeaders);

// CORS
app.use(corsConfig);

// Compression
app.use(compression());

// Request logging
app.use(requestLogger);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// General rate limiting
app.use(generalLimiter);

// ============================================
// ROUTES
// ============================================

// API routes
app.use('/api', apiRoutes);

// Stripe webhook (must be before express.json() for raw body)
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return res.status(400).json({ error: 'Missing webhook signature or secret' });
  }

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);

    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    // Handle webhook event
    const { handleWebhookEvent } = await import('./services/stripe-service.js');
    await handleWebhookEvent(event);

    logger.info('Webhook processed', { eventType: event.type });
    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook error', { error: error.message });
    res.status(400).json({ error: error.message });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Sentry error handler
attachSentryErrorHandler(app);

// Global error handler
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
  try {
    // Initialize database
    logger.info('Initializing database...');
    await initializeDatabase();

    // Initialize cache
    logger.info('Initializing cache...');
    await initializeCache();

    // Check health
    const health = await healthCheck();
    logger.info('Health check', health);

    // Start server
    const port = env.PORT || 3001;
    app.listen(port, () => {
      logger.info(`✅ Server running on http://localhost:${port}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`Database: ${env.DATABASE_URL ? 'PostgreSQL' : 'SQLite'}`);
      logger.info(`Redis: ${env.REDIS_ENABLED ? 'Enabled' : 'Disabled'}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function shutdown() {
  logger.info('Shutting down gracefully...');

  try {
    await closeDatabase();
    await closeCache();
    logger.info('✅ Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error('Shutdown error', { error: error.message });
    process.exit(1);
  }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================
// START SERVER
// ============================================

startServer();

export default app;

import * as Sentry from '@sentry/node';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Initialize Sentry for error tracking
 */
export function initializeSentry(app) {
  if (!env.SENTRY_DSN) {
    logger.info('Sentry disabled - no DSN provided');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app, request: true, serverName: false }),
    ],
  });

  // Attach Sentry middleware
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());

  logger.info('✅ Sentry initialized');
}

/**
 * Attach Sentry error handler
 */
export function attachSentryErrorHandler(app) {
  app.use(Sentry.Handlers.errorHandler());
}

/**
 * Capture exception
 */
export function captureException(error, context = {}) {
  Sentry.captureException(error, { extra: context });
  logger.error('Exception captured', { error: error.message, context });
}

/**
 * Capture message
 */
export function captureMessage(message, level = 'info', context = {}) {
  Sentry.captureMessage(message, level);
  logger.log(level, message, context);
}

/**
 * Set user context
 */
export function setUserContext(userId, email = null, name = null) {
  Sentry.setUser({
    id: userId,
    email,
    username: name,
  });
}

/**
 * Clear user context
 */
export function clearUserContext() {
  Sentry.setUser(null);
}

/**
 * Set custom context
 */
export function setContext(name, context) {
  Sentry.setContext(name, context);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(message, category = 'user-action', level = 'info', data = {}) {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data,
  });
}

export default {
  initializeSentry,
  attachSentryErrorHandler,
  captureException,
  captureMessage,
  setUserContext,
  clearUserContext,
  setContext,
  addBreadcrumb,
};

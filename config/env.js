/**
 * Environment Configuration with Validation
 * Ensures all required variables are set and properly typed
 */

function getEnv(key, defaultValue = undefined, required = false) {
  const value = process.env[key] ?? defaultValue;

  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function getEnvNumber(key, defaultValue = undefined, required = false) {
  const value = getEnv(key, defaultValue, required);
  if (value === undefined) return undefined;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return num;
}

function getEnvBoolean(key, defaultValue = false) {
  const value = getEnv(key, String(defaultValue));
  return value === 'true' || value === '1' || value === 'yes';
}

// ============================================
// ENVIRONMENT CONFIGURATION
// ============================================
export const env = {
  // ============================================
  // APPLICATION
  // ============================================
  NODE_ENV: getEnv('NODE_ENV', 'development'),
  PORT: getEnvNumber('PORT', 3001),
  FRONTEND_URL: getEnv('FRONTEND_URL', 'http://localhost:3000'),

  // ============================================
  // DATABASE
  // ============================================
  DATABASE_URL: getEnv('DATABASE_URL', 'sqlite:./neuralops.db'),
  DATABASE_POOL_MIN: getEnvNumber('DATABASE_POOL_MIN', 2),
  DATABASE_POOL_MAX: getEnvNumber('DATABASE_POOL_MAX', 10),

  // ============================================
  // AUTHENTICATION & SECURITY
  // ============================================
  JWT_SECRET: getEnv('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-key-change-in-production'),
  JWT_EXPIRY: getEnv('JWT_EXPIRY', '7d'),
  BCRYPT_ROUNDS: getEnvNumber('BCRYPT_ROUNDS', 10),
  SESSION_SECRET: getEnv('SESSION_SECRET', 'session-secret-change-in-production'),
  ALLOWED_ORIGINS: getEnv('ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:3001'),

  // ============================================
  // STRIPE (PAYMENT)
  // ============================================
  STRIPE_SECRET_KEY: getEnv('STRIPE_SECRET_KEY'),
  STRIPE_PUBLISHABLE_KEY: getEnv('STRIPE_PUBLISHABLE_KEY'),
  STRIPE_WEBHOOK_SECRET: getEnv('STRIPE_WEBHOOK_SECRET'),

  // ============================================
  // SUPABASE
  // ============================================
  SUPABASE_URL: getEnv('SUPABASE_URL'),
  SUPABASE_ANON_KEY: getEnv('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: getEnv('SUPABASE_SERVICE_ROLE_KEY'),

  // ============================================
  // REDIS (CACHING)
  // ============================================
  REDIS_URL: getEnv('REDIS_URL', 'redis://localhost:6379'),
  REDIS_ENABLED: getEnvBoolean('REDIS_ENABLED', false),

  // ============================================
  // EMAIL SERVICE
  // ============================================
  SMTP_HOST: getEnv('SMTP_HOST'),
  SMTP_PORT: getEnvNumber('SMTP_PORT', 587),
  SMTP_USER: getEnv('SMTP_USER'),
  SMTP_PASS: getEnv('SMTP_PASS'),
  SMTP_FROM: getEnv('SMTP_FROM', 'noreply@neuralops.com'),

  // ============================================
  // SLACK INTEGRATION
  // ============================================
  SLACK_WEBHOOK_URL: getEnv('SLACK_WEBHOOK_URL'),

  // ============================================
  // SENTRY (ERROR TRACKING)
  // ============================================
  SENTRY_DSN: getEnv('SENTRY_DSN'),

  // ============================================
  // OPENAI (LLM)
  // ============================================
  OPENAI_API_KEY: getEnv('OPENAI_API_KEY'),
  OPENAI_MODEL: getEnv('OPENAI_MODEL', 'gpt-4-turbo-preview'),

  // ============================================
  // LOGGING
  // ============================================
  LOG_LEVEL: getEnv('LOG_LEVEL', 'info'),

  // ============================================
  // AGENT CONFIGURATION
  // ============================================
  CHURN_RISK_THRESHOLD: getEnvNumber('CHURN_RISK_THRESHOLD', 40),
  UPSELL_CONFIDENCE_THRESHOLD: getEnvNumber('UPSELL_CONFIDENCE_THRESHOLD', 60),
  CONTRACT_DEVIATION_THRESHOLD: getEnvNumber('CONTRACT_DEVIATION_THRESHOLD', 10),

  // ============================================
  // MANUS INTEGRATION
  // ============================================
  BUILT_IN_FORGE_API_KEY: getEnv('BUILT_IN_FORGE_API_KEY'),
  BUILT_IN_FORGE_API_URL: getEnv('BUILT_IN_FORGE_API_URL'),
  VITE_FRONTEND_FORGE_API_KEY: getEnv('VITE_FRONTEND_FORGE_API_KEY'),
  VITE_FRONTEND_FORGE_API_URL: getEnv('VITE_FRONTEND_FORGE_API_URL'),
};

// ============================================
// VALIDATION
// ============================================
function validateEnvironment() {
  const errors = [];

  // Production requirements
  if (env.NODE_ENV === 'production') {
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be set and at least 32 characters in production');
    }
    if (!env.DATABASE_URL) {
      errors.push('DATABASE_URL is required in production');
    }
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }

  console.log('✅ Environment configuration validated');
}

// Validate on import
validateEnvironment();

export default env;

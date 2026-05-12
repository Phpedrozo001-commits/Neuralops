# 🚀 NeuralOps Deployment Guide

## Overview

Este guia cobre o deployment do NeuralOps melhorado para produção com todas as otimizações e integrações implementadas.

---

## 📋 Pre-Deployment Checklist

### Security
- [ ] JWT_SECRET configurado (32+ caracteres)
- [ ] SESSION_SECRET configurado
- [ ] DATABASE_URL apontando para Supabase
- [ ] STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET configurados
- [ ] ALLOWED_ORIGINS configurado para seu domínio
- [ ] NODE_ENV=production

### Database
- [ ] Supabase PostgreSQL criado e testado
- [ ] Migrations aplicadas (001_init_schema.sql)
- [ ] Backups configurados
- [ ] Connection pooling testado

### Stripe
- [ ] Conta Stripe criada
- [ ] Planos criados (Free, Pro, Enterprise)
- [ ] Webhook configurado para sua URL
- [ ] Chaves de API testadas

### Redis (Optional)
- [ ] Redis instance criado (Heroku, AWS ElastiCache, etc)
- [ ] REDIS_URL configurado
- [ ] REDIS_ENABLED=true

### Monitoring
- [ ] Sentry DSN configurado
- [ ] Logs configurados
- [ ] Health checks testados

---

## 🔧 Environment Variables

### Required
```bash
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://seu-dominio.com

# Database
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres

# Security
JWT_SECRET=<gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
SESSION_SECRET=<gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# CORS
ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com
```

### Optional
```bash
# Redis
REDIS_ENABLED=true
REDIS_URL=redis://user:password@redis-host:6379

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=app-password
SMTP_FROM=noreply@seu-dominio.com

# Monitoring
SENTRY_DSN=https://...@sentry.io/...
LOG_LEVEL=info

# OpenAI
OPENAI_API_KEY=sk-...
```

---

## 📦 Deployment Steps

### 1. Prepare Supabase

```bash
# Create new project on supabase.com
# Copy connection string

# Apply migrations
psql $DATABASE_URL < migrations/001_init_schema.sql

# Verify schema
psql $DATABASE_URL -c "\dt"
```

### 2. Prepare Stripe

```bash
# Create Stripe account
# Create products and prices for each plan:
# - Free (price_free)
# - Pro (price_pro)
# - Enterprise (price_enterprise)

# Get webhook signing secret
# Configure webhook URL: https://seu-dominio.com/api/webhooks/stripe
```

### 3. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard
# Settings > Environment Variables > Add each variable
```

### 4. Verify Deployment

```bash
# Test health check
curl https://seu-dominio.com/api/health

# Test database connection
curl https://seu-dominio.com/api/health

# Check logs
vercel logs --prod
```

### 5. Configure Stripe Webhook

```bash
# In Stripe Dashboard:
# 1. Go to Developers > Webhooks
# 2. Add endpoint: https://seu-dominio.com/api/webhooks/stripe
# 3. Select events:
#    - customer.subscription.updated
#    - customer.subscription.deleted
#    - invoice.payment_succeeded
#    - invoice.payment_failed
# 4. Copy signing secret to STRIPE_WEBHOOK_SECRET
```

---

## 🔄 Database Migrations

### Apply Migration

```bash
# Using psql
psql $DATABASE_URL < migrations/001_init_schema.sql

# Or using Node.js
node scripts/migrate.js
```

### Create New Migration

```bash
# Create migration file
touch migrations/002_your_migration.sql

# Add SQL changes
# Apply with psql
```

---

## 📊 Monitoring & Logs

### View Logs

```bash
# Vercel logs
vercel logs --prod

# Sentry errors
# Go to sentry.io and check your project

# Local logs (if using Winston)
tail -f logs/error.log
tail -f logs/combined.log
```

### Health Checks

```bash
# Database
curl https://seu-dominio.com/api/health

# Response should be:
# {
#   "status": "ok",
#   "timestamp": "2026-05-12T...",
#   "database": "connected"
# }
```

---

## 🔐 Security Best Practices

1. **HTTPS Only**
   - Vercel provides free SSL/TLS
   - Ensure all traffic is encrypted

2. **Rate Limiting**
   - Already configured in middleware
   - Monitor for abuse patterns

3. **Database Security**
   - Use Supabase's built-in security
   - Enable SSL connections
   - Regular backups

4. **API Security**
   - All endpoints require authentication
   - CORS properly configured
   - CSRF tokens for state-changing operations

5. **Secrets Management**
   - Use Vercel's environment variables
   - Never commit secrets to git
   - Rotate secrets regularly

---

## 🚨 Troubleshooting

### Database Connection Failed

```bash
# Check connection string
echo $DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT NOW();"

# Check firewall rules in Supabase
```

### Stripe Webhook Not Firing

```bash
# Check webhook URL in Stripe Dashboard
# Verify endpoint is accessible
curl https://seu-dominio.com/api/webhooks/stripe

# Check webhook signing secret
# Verify events are being sent
```

### High Memory Usage

```bash
# Check for memory leaks
# Increase Node.js heap size
NODE_OPTIONS=--max-old-space-size=2048

# Profile with clinic.js
npm install -g clinic
clinic doctor -- node index.js
```

### Slow Queries

```bash
# Check database indexes
# Enable query logging in Supabase
# Use EXPLAIN ANALYZE for slow queries
EXPLAIN ANALYZE SELECT * FROM customers WHERE email = 'test@example.com';
```

---

## 📈 Performance Optimization

### Database
- [ ] Indexes created for frequently queried columns
- [ ] Query caching with Redis
- [ ] Connection pooling configured

### Application
- [ ] Compression middleware enabled
- [ ] Static assets cached
- [ ] API response caching

### Frontend
- [ ] Code splitting implemented
- [ ] Lazy loading for images
- [ ] Minification enabled

---

## 🔄 Rollback Procedure

If something goes wrong:

```bash
# Vercel automatically keeps deployment history
# Go to Vercel dashboard > Deployments
# Click on previous deployment
# Click "Promote to Production"

# Or via CLI
vercel promote <deployment-url>
```

---

## 📞 Support

For issues:

1. Check Vercel logs: `vercel logs --prod`
2. Check Sentry for errors: https://sentry.io
3. Check Supabase status: https://status.supabase.com
4. Check Stripe status: https://status.stripe.com

---

## ✅ Post-Deployment

- [ ] Test login flow
- [ ] Test subscription creation
- [ ] Test payment processing
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify backups are working
- [ ] Document any issues

---

**Deployment Date:** _____________
**Deployed By:** _____________
**Status:** ✅ Live / ⚠️ Issues / ❌ Rollback

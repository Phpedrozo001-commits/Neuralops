# 🔒 Security Documentation

## Overview

NeuralOps Backend implements enterprise-grade security features to protect your autonomous business intelligence system.

## Authentication & Authorization

### JWT Authentication

All protected endpoints require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

#### Login

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@company.com",
    "password": "secure-password"
  }'
```

Response:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@company.com",
    "role": "admin"
  }
}
```

#### Register

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@company.com",
    "password": "secure-password-min-8-chars",
    "name": "John Doe"
  }'
```

#### Refresh Token

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Authorization: Bearer <your-token>"
```

### Role-Based Access Control (RBAC)

Three roles are supported:

- **admin**: Full access to all endpoints and admin features
- **manager**: Access to agent triggers and approvals
- **user**: Read-only access to dashboards and data

#### Role Requirements

```
GET  /api/dashboard/overview       → authenticated users
POST /api/churn/trigger            → admin, manager
POST /api/upsell/trigger           → admin, manager
POST /api/financial/trigger        → admin, manager
POST /api/contracts/trigger        → admin, manager
POST /api/approvals/:id/approve    → admin, manager
POST /api/approvals/:id/reject     → admin, manager
GET  /api/audit/logs               → admin only
POST /api/customers                → admin, manager
POST /api/contracts                → admin, manager
```

## Rate Limiting

### Limits by Endpoint Type

| Endpoint Type | Limit | Window |
|---|---|---|
| General API | 100 requests | 15 minutes |
| Authentication | 5 requests | 15 minutes |
| Approvals | 10 requests | 1 minute |
| Agent Triggers | 5 requests | 1 minute |

### Rate Limit Headers

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1234567890
```

When rate limit is exceeded:
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

## Input Validation & Sanitization

### Validation Rules

All inputs are validated using Joi schema validation:

- **Email**: Must be valid email format
- **Password**: Minimum 8 characters
- **Names**: Maximum 255 characters
- **MRR/Costs**: Must be positive numbers
- **Engagement Score**: 0-100 range
- **Message**: Maximum 1000 characters

### Sanitization

Dangerous characters are automatically removed:
- HTML/XML tags: `< >`
- SQL injection patterns: `--`, `;`
- Special characters are escaped

### Example: Invalid Request

```bash
curl -X POST http://localhost:3001/api/customers \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test",
    "email": "invalid-email",
    "mrr": -100
  }'
```

Response:
```json
{
  "errors": [
    { "field": "email", "message": "Valid email is required" },
    { "field": "mrr", "message": "MRR must be a positive number" }
  ]
}
```

## Security Headers

### HSTS (HTTP Strict Transport Security)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

Enforces HTTPS for 1 year.

### Content Security Policy

```
Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'
```

Prevents XSS attacks.

### Clickjacking Protection

```
X-Frame-Options: DENY
```

Prevents embedding in iframes.

### MIME Type Sniffing

```
X-Content-Type-Options: nosniff
```

Prevents MIME type sniffing.

### XSS Protection

```
X-XSS-Protection: 1; mode=block
```

Enables browser XSS filters.

## CORS Configuration

### Allowed Origins

```javascript
[
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'https://neuralops-sage.vercel.app',
  process.env.FRONTEND_URL
]
```

### Allowed Methods

```
GET, POST, PUT, DELETE, OPTIONS
```

### Allowed Headers

```
Content-Type, Authorization
```

### Credentials

```
Access-Control-Allow-Credentials: true
```

## Audit Logging

All sensitive operations are logged in the `audit_logs` table:

### Logged Events

- User login/logout
- Dashboard access
- Agent triggers
- Decision approvals/rejections
- Customer/contract creation/modification
- Chat messages

### Audit Log Fields

```
- user_id: Who performed the action
- action: Type of action (LOGIN, CREATE, APPROVE, etc.)
- resource_type: What was affected (customer, contract, approval, etc.)
- resource_id: ID of the affected resource
- old_value: Previous state (for updates)
- new_value: New state (for updates)
- ip_address: Source IP address
- user_agent: Browser/client information
- created_at: When the action occurred
```

### Query Audit Logs

```bash
curl -X GET "http://localhost:3001/api/audit/logs?userId=1&action=APPROVE_DECISION" \
  -H "Authorization: Bearer <admin-token>"
```

## Environment Variables

### Critical Security Variables

```env
# MUST be changed in production
JWT_SECRET=your-super-secret-key-change-in-production-min-32-chars

# Set to production
NODE_ENV=production

# Specify allowed frontend URLs
FRONTEND_URL=https://your-frontend-domain.com

# Database path
DATABASE_URL=./neuralops.db
```

### Generating a Secure JWT Secret

```bash
# Linux/Mac
openssl rand -base64 32

# Or using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Best Practices

### 1. Change Default Secrets

Before deploying to production:

```bash
# Generate new JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env
```

### 2. Use HTTPS in Production

All traffic should be encrypted:

```env
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
```

### 3. Implement Database Encryption

For sensitive data, consider:
- Encrypting customer emails
- Hashing sensitive contract information
- Using database-level encryption

### 4. Regular Security Audits

```bash
# Review audit logs regularly
curl -X GET "http://localhost:3001/api/audit/logs?startDate=2024-01-01" \
  -H "Authorization: Bearer <admin-token>"
```

### 5. Monitor Failed Logins

```bash
# Check for suspicious login attempts
curl -X GET "http://localhost:3001/api/audit/logs?action=LOGIN" \
  -H "Authorization: Bearer <admin-token>"
```

### 6. Rotate Tokens Regularly

Implement token refresh:

```bash
curl -X POST http://localhost:3001/api/auth/refresh \
  -H "Authorization: Bearer <old-token>"
```

### 7. Limit API Access

Use firewall rules to restrict API access:

```bash
# Allow only from your frontend domain
ufw allow from 123.456.789.0 to any port 3001
```

## Vulnerability Reporting

If you discover a security vulnerability, please email security@neuralops.dev with:

1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if applicable)

Do NOT publicly disclose vulnerabilities until they are fixed.

## Compliance

### GDPR Compliance

- User data is stored securely
- Audit logs track all data access
- Implement data deletion on request
- Use HTTPS for all data transmission

### SOC 2 Compliance

- Role-based access control
- Comprehensive audit logging
- Secure password policies
- Regular security updates

## Security Checklist for Production

- [ ] Change JWT_SECRET to a strong random value
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS for specific domains only
- [ ] Set up regular database backups
- [ ] Enable audit logging
- [ ] Implement API key rotation
- [ ] Set up monitoring and alerting
- [ ] Review and test rate limiting
- [ ] Document security procedures
- [ ] Train team on security practices
- [ ] Perform security audit
- [ ] Set up incident response plan

## Support

For security questions or concerns, contact: security@neuralops.dev

---

**Last Updated**: May 2026
**Version**: 1.0.0

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// General rate limiter
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health'
});

// Strict rate limiter for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// Approval endpoint limiter
export const approvalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many approval requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// Agent trigger limiter
export const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Agent already running, please wait before triggering again.',
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================
// SECURITY HEADERS (CSP corrigido)
// ============================================
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // ✅ Permite scripts inline (cursor, animações, lógica das páginas)
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      // ✅ Permite onclick=, onkeypress= e outros event handlers inline
      scriptSrcAttr: ["'unsafe-inline'"],
      // ✅ Permite estilos inline E Google Fonts
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // ✅ Permite carregar fontes do Google
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      // ✅ Permite imagens de qualquer HTTPS e data URIs
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      // ✅ Permite conexões à própria API, Anthropic E Google Fonts
      connectSrc: [
        "'self'",
        "https://api.anthropic.com",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        "https://corsproxy.io",
        "https://api.z-api.io",
        "https://api.resend.com"
      ],
      // ✅ Permite workers (service worker PWA)
      workerSrc: ["'self'", "blob:"],
      // Bloqueia outros recursos por padrão
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
});

// CORS configuration
export function corsConfig(req, res, next) {
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'https://neuralops-sage.vercel.app',
    'https://neuralops-production-0f6e.up.railway.app',
    process.env.FRONTEND_URL
  ].filter(Boolean);

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '3600');

  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
}

// Error handling middleware
export function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err.name === 'JsonWebTokenError') return res.status(401).json({ error: 'Invalid token' });
  if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
  if (err.status === 429) return res.status(429).json({ error: 'Too many requests' });
  if (err.message?.includes('SQLITE_CONSTRAINT')) return res.status(400).json({ error: 'Duplicate entry or constraint violation' });

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
}

// Request logging middleware
export function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
}

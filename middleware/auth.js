import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDatabase } from '../db.js';

// ============================================
// SECURITY: Require JWT_SECRET in production
// ============================================
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters in production');
  }
  console.warn('⚠️  WARNING: JWT_SECRET not properly configured. Using development fallback.');
}

const JWT_EXPIRY = '7d';
const BCRYPT_ROUNDS = 10;

/**
 * Generate JWT token with proper expiry
 * @param {number} userId - User ID
 * @param {string} role - User role (user, admin)
 * @returns {Promise<string>} JWT token
 */
export async function generateToken(userId, role = 'user') {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    { userId, role, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify JWT token - FIXED: now properly async
 * @param {string} token - JWT token to verify
 * @returns {Promise<object|null>} Decoded token or null if invalid
 */
export async function verifyToken(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.warn(`Token verification failed: ${error.message}`);
    return null;
  }
}

/**
 * Hash password with bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password) {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * FIXED: Properly async middleware with await
 */
export async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    // FIXED: Now properly awaits the async verifyToken
    const decoded = await verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Middleware to require specific roles
 * @param {...string} roles - Allowed roles
 * @returns {Function} Express middleware
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Login user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @returns {Promise<object>} Login result with token
 */
export async function loginUser(email, password) {
  const db = await getDatabase();

  try {
    if (!email || !password) {
      return { success: false, error: 'Email and password are required' };
    }

    const user = await db.get(
      `SELECT id, email, password_hash, role FROM users WHERE email = ?`,
      [email]
    );

    if (!user) {
      return { success: false, error: 'Invalid credentials' };
    }

    // FIXED: Now uses bcrypt for secure password comparison
    const passwordMatch = await comparePassword(password, user.password_hash);

    if (!passwordMatch) {
      return { success: false, error: 'Invalid credentials' };
    }

    const token = await generateToken(user.id, user.role);

    // Update last login
    await db.run(
      `UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?`,
      [user.id]
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Register new user with email and password
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} name - User name
 * @returns {Promise<object>} Registration result with token
 */
export async function registerUser(email, password, name) {
  const db = await getDatabase();

  try {
    if (!email || !password || !name) {
      return { success: false, error: 'Email, password, and name are required' };
    }

    if (password.length < 8) {
      return { success: false, error: 'Password must be at least 8 characters' };
    }

    // Check if user exists
    const existing = await db.get(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (existing) {
      return { success: false, error: 'User already exists' };
    }

    // FIXED: Now uses bcrypt to hash password securely
    const hashedPassword = await hashPassword(password);

    const result = await db.run(
      `INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)`,
      [email, hashedPassword, name, 'user']
    );

    const token = await generateToken(result.lastID, 'user');

    return {
      success: true,
      token,
      user: {
        id: result.lastID,
        email,
        name,
        role: 'user'
      }
    };
  } catch (error) {
    console.error('Registration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} Validation result
 */
export function validatePasswordStrength(password) {
  const errors = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*]/.test(password)) {
    errors.push('Password must contain at least one special character (!@#$%^&*)');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

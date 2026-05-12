/**
 * NeuralOps - Authentication API Routes
 * Handles user registration, login, and session management
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { authenticateToken } = require('../middleware/auth');

// In-memory user store (replace with database in production)
const users = new Map();

/**
 * Hash password
 */
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Generate JWT token
 */
function generateToken(userId) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payload = Buffer.from(JSON.stringify({
    userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  })).toString('base64');
  
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET || 'your-secret-key')
    .update(`${header}.${payload}`)
    .digest('base64');
  
  return `${header}.${payload}.${signature}`;
}

/**
 * Register new user
 * POST /api/auth/register
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({ message: 'Email, password, and name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if user already exists
    if (users.has(email)) {
      return res.status(409).json({ message: 'User already exists' });
    }

    // Create user
    const userId = crypto.randomUUID();
    const hashedPassword = hashPassword(password);
    
    const user = {
      id: userId,
      email,
      name,
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      settings: {
        churnThreshold: 40,
        upsellThreshold: 60,
        contractThreshold: 10
      }
    };

    users.set(email, user);

    // Generate token
    const token = generateToken(userId);

    // Log activity
    console.log(`[AUTH] User registered: ${email}`);

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

/**
 * Login user
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = users.get(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Verify password
    const hashedPassword = hashPassword(password);
    if (user.password !== hashedPassword) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token
    const token = generateToken(user.id);

    // Log activity
    console.log(`[AUTH] User logged in: ${email}`);

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        settings: user.settings
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

/**
 * Verify token
 * GET /api/auth/verify
 */
router.get('/verify', authenticateToken, (req, res) => {
  try {
    const user = users.get(req.user.email);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ message: 'Verification failed' });
  }
});

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = users.get(req.user.email);
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user' });
  }
});

/**
 * Logout (client-side only, but endpoint for completeness)
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

/**
 * Update user settings
 * PUT /api/auth/settings
 */
router.put('/settings', authenticateToken, (req, res) => {
  try {
    const { churnThreshold, upsellThreshold, contractThreshold } = req.body;
    const user = users.get(req.user.email);

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (churnThreshold !== undefined) user.settings.churnThreshold = churnThreshold;
    if (upsellThreshold !== undefined) user.settings.upsellThreshold = upsellThreshold;
    if (contractThreshold !== undefined) user.settings.contractThreshold = contractThreshold;

    console.log(`[AUTH] User settings updated: ${req.user.email}`);

    res.json({
      success: true,
      settings: user.settings
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ message: 'Failed to update settings' });
  }
});

module.exports = router;

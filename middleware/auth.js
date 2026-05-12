import jwt from 'jsonwebtoken';
import { getDatabase } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

export async function generateToken(userId, role = 'user') {
  return jwt.sign(
    { userId, role, timestamp: Date.now() },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

export async function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

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

export async function loginUser(email, password) {
  const db = await getDatabase();

  try {
    const user = await db.get(
      `SELECT id, email, password_hash, role FROM users WHERE email = ?`,
      [email]
    );

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // In production, use bcrypt to compare passwords
    // const passwordMatch = await bcrypt.compare(password, user.password_hash);
    // For now, simple comparison (NOT SECURE - use bcrypt in production)
    if (user.password_hash !== password) {
      return { success: false, error: 'Invalid password' };
    }

    const token = await generateToken(user.id, user.role);

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
    return { success: false, error: error.message };
  }
}

export async function registerUser(email, password, name) {
  const db = await getDatabase();

  try {
    // Check if user exists
    const existing = await db.get(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (existing) {
      return { success: false, error: 'User already exists' };
    }

    // In production, use bcrypt to hash password
    // const hashedPassword = await bcrypt.hash(password, 10);
    // For now, simple storage (NOT SECURE - use bcrypt in production)
    const hashedPassword = password;

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
    return { success: false, error: error.message };
  }
}

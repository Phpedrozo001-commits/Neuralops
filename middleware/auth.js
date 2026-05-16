import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'neuralops_dev_secret_fallback_32chars!!';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET não configurada. Use variável de ambiente em produção!');
}

const JWT_EXPIRY = '7d';
const BCRYPT_ROUNDS = 10;

export async function generateToken(userId, role = 'user') {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ userId, role, timestamp: Date.now() }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export async function verifyToken(token) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function hashPassword(password) {
  if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    const decoded = await verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
    next();
  };
}

export async function loginUser(email, password) {
  const db = await getDatabase();
  try {
    if (!email || !password) return { success: false, error: 'Email and password are required' };
    const user = await db.get('SELECT id, email, password_hash, role FROM users WHERE email = ?', [email]);
    if (!user) return { success: false, error: 'Invalid credentials' };
    const passwordMatch = await comparePassword(password, user.password_hash);
    if (!passwordMatch) return { success: false, error: 'Invalid credentials' };
    const token = await generateToken(user.id, user.role);
    await db.run('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    return { success: true, token, user: { id: user.id, email: user.email, role: user.role } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function registerUser(email, password, name) {
  const db = await getDatabase();
  try {
    if (!email || !password || !name) return { success: false, error: 'Email, password, and name are required' };
    if (password.length < 8) return { success: false, error: 'Password must be at least 8 characters' };
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return { success: false, error: 'User already exists' };
    const hashedPassword = await hashPassword(password);
    const result = await db.run('INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)', [email, hashedPassword, name, 'user']);
    const token = await generateToken(result.lastID, 'user');
    return { success: true, token, user: { id: result.lastID, email, name, role: 'user' } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

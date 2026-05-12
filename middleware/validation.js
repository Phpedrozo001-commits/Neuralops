import { body, validationResult } from 'express-validator';

export function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}

export const customerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 255 }),
  body('email').isEmail().withMessage('Valid email is required'),
  body('mrr').optional().isFloat({ min: 0 }).withMessage('MRR must be a positive number'),
  body('engagement_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Engagement score must be between 0 and 100')
];

export const contractValidation = [
  body('vendor_name').trim().notEmpty().withMessage('Vendor name is required').isLength({ max: 255 }),
  body('annual_cost').isFloat({ min: 0 }).withMessage('Annual cost must be a positive number'),
  body('market_rate').isFloat({ min: 0 }).withMessage('Market rate must be a positive number')
];

export const approvalValidation = [
  body('approvedBy').trim().notEmpty().withMessage('Approver name is required'),
  body('reason').optional().trim().isLength({ max: 500 })
];

export const loginValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 6 })
];

export const registerValidation = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('name').trim().notEmpty().withMessage('Name is required')
];

export const chatValidation = [
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 1000 })
];

export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/--/g, '') // Remove SQL comment syntax
    .replace(/;/g, '') // Remove semicolons
    .trim();
}

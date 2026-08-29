const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verify JWT, load user, attach to req.user.
 * `req.user` shape: { id, email, user_type, is_active, full_name, ... }
 */
exports.protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authorized, no token' });
    }
    const token = auth.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized, malformed token' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
    }

    const result = await query(
      `SELECT id, email, user_type, full_name, is_active, locked_until
       FROM users WHERE id = $1`,
      [decoded.id]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account deactivated' });
    }
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ success: false, message: 'Account temporarily locked' });
    }
    req.user = user;
    next();
  } catch (err) {
    console.error('protect middleware error:', err);
    res.status(500).json({ success: false, message: 'Auth check failed' });
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.user_type === 'admin') return next();
  res.status(403).json({ success: false, message: 'Admin access required' });
};

exports.employerOnly = (req, res, next) => {
  if (req.user?.user_type === 'employer' || req.user?.user_type === 'admin') return next();
  res.status(403).json({ success: false, message: 'Employer access required' });
};

/**
 * Optional auth — sets req.user if a valid token is present, otherwise continues
 * without throwing. Use for endpoints that have both public and personalized behavior.
 */
exports.optionalAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return next();
  return exports.protect(req, res, next);
};

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { protect, adminOnly } = require('../middleware/auth');
const userCtrl = require('../controllers/user.controller');

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

router.use(protect, adminOnly);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [users, jobs, applications, services, orders, revenue] = await Promise.all([
      query('SELECT COUNT(*)::int as c FROM users'),
      query(`SELECT COUNT(*)::int as c FROM jobs WHERE status = 'active'`),
      query('SELECT COUNT(*)::int as c FROM job_applications'),
      query(`SELECT COUNT(*)::int as c FROM services WHERE status = 'active'`),
      query(`SELECT COUNT(*)::int as c FROM service_orders`),
      query(`SELECT COALESCE(SUM(amount), 0)::float as total FROM commissions WHERE status = 'paid'`)
    ]);
    res.json({
      success: true,
      data: {
        total_users: users.rows[0].c,
        active_jobs: jobs.rows[0].c,
        total_applications: applications.rows[0].c,
        active_services: services.rows[0].c,
        total_orders: orders.rows[0].c,
        total_revenue: revenue.rows[0].total
      }
    });
  } catch (err) {
    console.error('admin stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 50, user_type, search } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const where = [];
    const params = [];
    let i = 1;
    if (user_type) { where.push(`user_type = $${i++}`); params.push(user_type); }
    if (search) { where.push(`(full_name ILIKE $${i++} OR username ILIKE $${i++} OR email ILIKE $${i++})`); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countResult = await query(`SELECT COUNT(*)::int as total FROM users ${whereSql}`, params);
    const result = await query(
      `SELECT id, full_name, username, email, phone, user_type, country, city,
              is_verified, is_active, is_premium, verification_badge, last_login, created_at
       FROM users ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total: countResult.rows[0].total, pages: Math.ceil(countResult.rows[0].total / limitNum) }
    });
  } catch (err) {
    console.error('admin users error:', err);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
});

// PUT /api/admin/users/:id/verify — admin verifies a user
router.put('/users/:id/verify', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const result = await query(
      `UPDATE users SET is_verified = true, verification_badge = 'identity', updated_at = NOW()
       WHERE id = $1 RETURNING id, is_verified, verification_badge`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('admin verify error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify user' });
  }
});

// PUT /api/admin/users/:id/deactivate
router.put('/users/:id/deactivate', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (req.params.id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate yourself' });
    }
    await query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [req.params.id]);
    // Revoke their tokens
    await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.params.id]);
    res.json({ success: true, message: 'User deactivated' });
  } catch (err) {
    console.error('admin deactivate error:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate user' });
  }
});

// PUT /api/admin/users/:id/activate
router.put('/users/:id/activate', async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    await query('UPDATE users SET is_active = true, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: 'User activated' });
  } catch (err) {
    console.error('admin activate error:', err);
    res.status(500).json({ success: false, message: 'Failed to activate user' });
  }
});

// POST /api/admin/users/:id/premium — body: { is_premium, duration_days }
router.post('/users/:id/premium', userCtrl.togglePremium);

// GET /api/admin/reports — list open user reports
router.get('/reports', async (req, res) => {
  try {
    const { status = 'open' } = req.query;
    const result = await query(
      `SELECT r.*, reporter.full_name as reporter_name, reported.full_name as reported_name
       FROM reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users reported ON reported.id = r.reported_id
       WHERE r.status = $1
       ORDER BY r.created_at DESC`,
      [status]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('admin reports error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
});

module.exports = router;

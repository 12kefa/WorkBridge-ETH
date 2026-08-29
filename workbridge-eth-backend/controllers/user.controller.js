const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { parseListParam } = require('../utils/query');
const { uploadToCloudinary } = require('../config/cloudinary');

const BCRYPT_ROUNDS = 10;
const ALLOWED_PROFILE_FIELDS = [
  'full_name', 'phone', 'profile_photo', 'date_of_birth', 'gender',
  'country', 'region', 'city', 'sub_city', 'full_address',
  'education_level', 'school', 'field_of_study', 'skills', 'languages',
  'experience', 'cv_url', 'certificates', 'portfolio_url',
  'salary_expectation', 'job_preference', 'availability',
  'emergency_contact', 'bio', 'reason_for_work',
  'company_name', 'company_logo', 'company_website',
  'business_license', 'industry', 'company_description', 'employee_count',
  'height_cm', 'weight_kg', 'age', 'model_photos', 'model_experience',
  'model_categories', 'model_availability',
  'dating_interests', 'dating_photos', 'dating_bio', 'dating_preferences'
];
const PUBLIC_PROFILE_FIELDS = [
  'id', 'full_name', 'username', 'profile_photo', 'user_type', 'country', 'region', 'city',
  'skills', 'languages', 'bio', 'portfolio_url', 'company_name', 'industry',
  'height_cm', 'weight_kg', 'is_verified', 'verification_badge', 'created_at'
];
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

exports.getProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, username, email, phone, user_type, profile_photo,
              date_of_birth, gender, country, region, city, sub_city, full_address,
              education_level, school, field_of_study, skills, languages, experience,
              cv_url, certificates, portfolio_url, salary_expectation, job_preference,
              availability, emergency_contact, bio, reason_for_work,
              company_name, company_logo, company_website, business_license, industry,
              company_description, employee_count,
              height_cm, weight_kg, age, model_photos, model_experience, model_categories,
              is_verified, is_active, is_premium, verification_badge, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (req.body[key] !== undefined) {
        setClauses.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    values.push(req.user.id);
    const sql = `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    delete result.rows[0].password_hash;
    res.json({ success: true, message: 'Profile updated', data: result.rows[0] });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword required' });
    }
    if (newPassword.length < 8 || newPassword.length > 200) {
      return res.status(400).json({ success: false, message: 'New password must be 8-200 characters' });
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    // Revoke all refresh tokens — force re-login
    await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
};

exports.getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    const result = await query(
      `SELECT ${PUBLIC_PROFILE_FIELDS.join(', ')} FROM users WHERE id = $1 AND is_active = true`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getPublicProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

exports.listUsers = async (req, res) => {
  try {
    const { user_type, city, skills, search, page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const where = [`is_active = true`];
    const params = [];
    let i = 1;
    if (user_type) { where.push(`user_type = $${i++}`); params.push(user_type); }
    if (city) { where.push(`city ILIKE $${i++}`); params.push(`%${city}%`); }
    const skillsList = parseListParam(skills);
    if (skillsList.length) { where.push(`skills && $${i++}::text[]`); params.push(skillsList); }
    if (search) { where.push(`(full_name ILIKE $${i++} OR username ILIKE $${i++} OR bio ILIKE $${i++})`); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const whereSql = where.join(' AND ');
    const countResult = await query(`SELECT COUNT(*)::int as total FROM users WHERE ${whereSql}`, params);
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT id, full_name, username, profile_photo, user_type, city, skills, is_verified, verification_badge
       FROM users WHERE ${whereSql}
       ORDER BY is_premium DESC, created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('listUsers error:', err);
    res.status(500).json({ success: false, message: 'Failed to list users' });
  }
};

// POST /api/users/me/photo — multipart field name "photo" (see uploadSingleImage in middleware/upload.js)
exports.uploadPhoto = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No photo file provided (field name: "photo")' });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return res.status(503).json({ success: false, message: 'Photo upload is not configured on this server yet (missing Cloudinary credentials)' });
    }
    const url = await uploadToCloudinary(req.file.buffer, 'workbridge/profiles');
    const result = await query(
      'UPDATE users SET profile_photo = $1, updated_at = NOW() WHERE id = $2 RETURNING id, profile_photo',
      [url, req.user.id]
    );
    res.json({ success: true, message: 'Photo updated', data: result.rows[0] });
  } catch (err) {
    console.error('uploadPhoto error:', err);
    res.status(500).json({ success: false, message: 'Failed to upload photo' });
  }
};

// ADMIN ONLY — guarded at the route level
// Route is POST /api/admin/users/:id/premium — the target user is the URL
// param, not the body. (Body only carries is_premium/duration_days.)
exports.togglePremium = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_premium, duration_days } = req.body || {};
    if (!isUuid(userId)) return res.status(400).json({ success: false, message: 'Invalid user id' });

    const premiumUntil = is_premium && duration_days
      ? new Date(Date.now() + parseInt(duration_days, 10) * 24 * 60 * 60 * 1000)
      : null;

    const result = await query(
      'UPDATE users SET is_premium = $1, premium_until = $2 WHERE id = $3 RETURNING id, is_premium, premium_until',
      [!!is_premium, premiumUntil, userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: `Premium ${is_premium ? 'activated' : 'deactivated'}`, data: result.rows[0] });
  } catch (err) {
    console.error('togglePremium error:', err);
    res.status(500).json({ success: false, message: 'Failed to update premium status' });
  }
};

const { query, withTransaction } = require('../config/database');
const { parseListParam } = require('../utils/query');

const ALLOWED_PROFILE_FIELDS = [
  'looking_for', 'age_min', 'age_max', 'distance_max', 'relationship_type',
  'interests', 'hobbies', 'about_me', 'ideal_match', 'photos', 'is_hidden'
];
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

exports.createProfile = async (req, res) => {
  try {
    const { looking_for, age_min, age_max, distance_max, relationship_type, interests, hobbies, about_me, ideal_match, photos } = req.body || {};

    if (age_min !== undefined && (age_min < 18 || age_min > 100)) {
      return res.status(400).json({ success: false, message: 'age_min must be 18-100' });
    }
    if (age_max !== undefined && (age_max < 18 || age_max > 100)) {
      return res.status(400).json({ success: false, message: 'age_max must be 18-100' });
    }

    const existing = await query('SELECT id FROM dating_profiles WHERE user_id = $1', [req.user.id]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Dating profile already exists' });
    }

    const result = await query(
      `INSERT INTO dating_profiles (user_id, looking_for, age_min, age_max, distance_max, relationship_type, interests, hobbies, about_me, ideal_match, photos)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.id, looking_for || null, age_min || null, age_max || null, distance_max || null, relationship_type || null, interests || [], hobbies || [], about_me || null, ideal_match || null, photos || []]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to create dating profile' });
  }
};

exports.getMyProfile = async (req, res) => {
  try {
    const result = await query(
      `SELECT dp.*, u.full_name, u.age, u.city, u.profile_photo
       FROM dating_profiles dp JOIN users u ON dp.user_id = u.id WHERE dp.user_id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Dating profile not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getMyProfile error:', err);
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
    const sql = `UPDATE dating_profiles SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = $${i} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Dating profile not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateDatingProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
};

exports.browseProfiles = async (req, res) => {
  try {
    const { gender, min_age, max_age, city, interests, page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const where = [`dp.user_id != $1`, `dp.is_hidden = false`, `u.is_active = true`];
    const params = [req.user.id];
    let i = 2;
    if (gender) { where.push(`u.gender = $${i++}`); params.push(gender); }
    if (min_age) { where.push(`u.age >= $${i++}`); params.push(parseInt(min_age, 10)); }
    if (max_age) { where.push(`u.age <= $${i++}`); params.push(parseInt(max_age, 10)); }
    if (city) { where.push(`u.city ILIKE $${i++}`); params.push(`%${city}%`); }
    const interestsList = parseListParam(interests);
    if (interestsList.length) { where.push(`dp.interests && $${i++}::text[]`); params.push(interestsList); }

    // Exclude already-liked
    where.push(`dp.user_id NOT IN (SELECT liked_id FROM dating_likes WHERE liker_id = $1)`);

    const whereSql = where.join(' AND ');
    const countResult = await query(
      `SELECT COUNT(*)::int as total FROM dating_profiles dp JOIN users u ON dp.user_id = u.id WHERE ${whereSql}`,
      params
    );
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT dp.*, u.full_name, u.age, u.city, u.profile_photo, u.is_verified
       FROM dating_profiles dp JOIN users u ON dp.user_id = u.id
       WHERE ${whereSql}
       ORDER BY dp.last_active DESC NULLS LAST, dp.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('browseProfiles error:', err);
    res.status(500).json({ success: false, message: 'Failed to browse profiles' });
  }
};

exports.likeProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (userId === req.user.id) return res.status(400).json({ success: false, message: 'Cannot like yourself' });

    const existing = await query(
      'SELECT id FROM dating_likes WHERE liker_id = $1 AND liked_id = $2',
      [req.user.id, userId]
    );
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: 'Already liked' });

    const mutual = await query(
      'SELECT id FROM dating_likes WHERE liker_id = $1 AND liked_id = $2',
      [userId, req.user.id]
    );
    const isMatch = mutual.rows.length > 0;

    await withTransaction(async (client) => {
      await client.query(
        'INSERT INTO dating_likes (liker_id, liked_id, is_match) VALUES ($1, $2, $3)',
        [req.user.id, userId, isMatch]
      );
      if (isMatch) {
        await client.query(
          'UPDATE dating_likes SET is_match = true WHERE liker_id = $1 AND liked_id = $2',
          [userId, req.user.id]
        );
        await client.query(
          `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
           VALUES ($1, 'New Match!', 'You have a new match!', 'match', $2, 'dating')`,
          [req.user.id, userId]
        );
        await client.query(
          `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
           VALUES ($1, 'New Match!', 'You have a new match!', 'match', $2, 'dating')`,
          [userId, req.user.id]
        );
      }
    });
    res.json({ success: true, data: { is_match: isMatch } });
  } catch (err) {
    console.error('likeProfile error:', err);
    res.status(500).json({ success: false, message: 'Failed to like profile' });
  }
};

exports.getMatches = async (req, res) => {
  try {
    const result = await query(
      `SELECT dl.id, dl.created_at,
              CASE WHEN dl.liker_id = $1 THEN dl.liked_id ELSE dl.liker_id END as matched_user_id,
              u.full_name, u.profile_photo, u.age, u.city, u.is_verified
       FROM dating_likes dl
       JOIN users u ON (CASE WHEN dl.liker_id = $1 THEN dl.liked_id ELSE dl.liker_id END) = u.id
       WHERE (dl.liker_id = $1 OR dl.liked_id = $1) AND dl.is_match = true
       ORDER BY dl.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getMatches error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch matches' });
  }
};

exports.getLikes = async (req, res) => {
  try {
    const result = await query(
      `SELECT dl.id, dl.liker_id, dl.created_at, u.full_name, u.profile_photo, u.age
       FROM dating_likes dl JOIN users u ON dl.liker_id = u.id
       WHERE dl.liked_id = $1 AND dl.is_match = false
       ORDER BY dl.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getLikes error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch likes' });
  }
};

exports.blockUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isUuid(userId)) return res.status(400).json({ success: false, message: 'Invalid user id' });
    if (userId === req.user.id) return res.status(400).json({ success: false, message: 'Cannot block yourself' });

    await query(
      `INSERT INTO reports (reporter_id, reported_id, report_type, reason, status)
       VALUES ($1, $2, 'block', 'User blocked', 'resolved')`,
      [req.user.id, userId]
    );
    res.json({ success: true, message: 'User blocked' });
  } catch (err) {
    console.error('blockUser error:', err);
    res.status(500).json({ success: false, message: 'Failed to block user' });
  }
};

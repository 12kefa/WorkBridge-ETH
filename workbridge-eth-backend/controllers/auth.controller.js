const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, withTransaction } = require('../config/database');
const { sendEmail } = require('../utils/email');
const { generateOTP, verifyOTP, generateQrDataURL } = require('../utils/otp');

const BCRYPT_ROUNDS = 10;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MIN = 15;
const REFRESH_TTL_DAYS = 30;

const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// ---------- token helpers ----------

const generateAccessToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, user_type: user.user_type },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '15m' }
  );

const generateRefreshToken = () =>
  crypto.randomBytes(48).toString('base64url');

const issueTokens = async (user) => {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), expiresAt]
  );

  return { accessToken, refreshToken, refreshExpiresAt: expiresAt };
};

// ---------- validation helpers ----------

const USER_TYPES = ['jobseeker', 'employer', 'freelancer', 'model', 'dating', 'business'];
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

const isValidEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isValidUsername = (s) => typeof s === 'string' && /^[a-zA-Z0-9_]{3,100}$/.test(s);
const isStrongEnough = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 200;

// ---------- controllers ----------

exports.register = async (req, res) => {
  try {
    const {
      full_name, username, email, phone, password, user_type,
      company_name, industry, company_description, height_cm, weight_kg
    } = req.body || {};

    if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Full name is required (2+ chars)' });
    }
    if (!isValidUsername(username)) {
      return res.status(400).json({ success: false, message: 'Username must be 3-100 chars, alphanumeric / underscore' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    if (!isStrongEnough(password)) {
      return res.status(400).json({ success: false, message: 'Password must be 8-200 characters' });
    }
    if (!USER_TYPES.includes(user_type)) {
      return res.status(400).json({ success: false, message: 'Invalid user_type' });
    }

    const normalizedEmail = email.toLowerCase();
    const normalizedUsername = username.toLowerCase();

    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [normalizedEmail, normalizedUsername]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const result = await query(
      `INSERT INTO users (
        full_name, username, email, phone, password_hash, user_type,
        company_name, industry, company_description, height_cm, weight_kg,
        email_verification_token, is_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
      RETURNING id, full_name, username, email, user_type, is_verified, created_at`,
      [
        full_name.trim(), normalizedUsername, normalizedEmail, phone || null,
        passwordHash, user_type, company_name || null, industry || null,
        company_description || null, height_cm || null, weight_kg || null,
        verificationToken
      ]
    );

    const user = result.rows[0];
    const tokens = await issueTokens(user);

    // Best-effort welcome email. Don't fail the request if SMTP isn't configured.
    try {
      const verifyUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
      await sendEmail({
        to: normalizedEmail,
        subject: 'Verify Your WorkBridge ETH Account',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Welcome to WorkBridge ETH!</h2>
            <p>Hi ${full_name},</p>
            <p>Thank you for joining Ethiopia's premier opportunity platform. Please verify your email to get started.</p>
            <a href="${verifyUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #6366f1, #f59e0b); color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">Verify Email</a>
            <p style="color: #666; font-size: 14px;">If you didn't create this account, you can safely ignore this email.</p>
            <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">Need help? Email <a href="mailto:tesfaykflay75@gmail.com" style="color: #6366f1;">tesfaykflay75@gmail.com</a> or message <a href="https://t.me/go_do369" style="color: #6366f1;">@go_do369</a> on Telegram.</p>
          </div>`
      });
    } catch (emailErr) {
      console.warn('Welcome email failed (non-fatal):', emailErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Account created successfully. Please verify your email.',
      data: {
        user: { id: user.id, full_name: user.full_name, username: user.username, email: user.email, user_type: user.user_type },
        ...tokens
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email/username and password required' });
    }

    const identifier = String(email).toLowerCase();

    const result = await query(
      `SELECT id, full_name, username, email, user_type, password_hash,
              is_verified, is_active, email_verified, login_attempts, locked_until
       FROM users WHERE email = $1 OR username = $1`,
      [identifier]
    );

    if (result.rows.length === 0) {
      // Generic message — don't leak which field matched
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const user = result.rows[0];

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        success: false,
        message: `Account temporarily locked. Try again after ${new Date(user.locked_until).toISOString()}.`
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = (user.login_attempts || 0) + 1;
      const lockUntil = attempts >= MAX_LOGIN_ATTEMPTS
        ? new Date(Date.now() + LOCK_DURATION_MIN * 60 * 1000)
        : null;
      await query(
        'UPDATE users SET login_attempts = $1, locked_until = $2 WHERE id = $3',
        [attempts, lockUntil, user.id]
      );
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Reset counters + update last_login
    await query(
      `UPDATE users SET login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1`,
      [user.id]
    );

    const tokens = await issueTokens(user);
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id, full_name: user.full_name, username: user.username,
          email: user.email, user_type: user.user_type,
          is_verified: user.is_verified, email_verified: user.email_verified
        },
        ...tokens
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ success: false, message: 'Token required' });

    const result = await query(
      `UPDATE users SET email_verified = true, email_verification_token = NULL
       WHERE email_verification_token = $1
       RETURNING id, email`,
      [token]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    console.error('verifyEmail error:', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ success: false, message: 'Refresh token required' });

    const tokenHash = hashToken(refreshToken);
    const result = await query(
      `SELECT rt.id as rt_id, rt.user_id, rt.expires_at, rt.revoked,
              u.id, u.email, u.user_type, u.is_active
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
    const row = result.rows[0];
    if (row.revoked || new Date(row.expires_at) < new Date() || !row.is_active) {
      return res.status(401).json({ success: false, message: 'Refresh token expired or revoked' });
    }

    // Rotate: revoke old, issue new
    const newRefresh = generateRefreshToken();
    const newExpires = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await withTransaction(async (client) => {
      await client.query('UPDATE refresh_tokens SET revoked = true WHERE id = $1', [row.rt_id]);
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
        [row.user_id, hashToken(newRefresh), newExpires]
      );
    });

    const accessToken = generateAccessToken(row);
    res.json({ success: true, data: { accessToken, refreshToken: newRefresh } });
  } catch (err) {
    console.error('refreshToken error:', err);
    res.status(500).json({ success: false, message: 'Token refresh failed' });
  }
};

exports.logout = async (req, res) => {
  try {
    // Revoke all refresh tokens for this user on logout.
    if (req.user?.id) {
      await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.user.id]);
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
};

// DELETE /api/auth/me — self-service deactivation (soft delete). Sets the
// same is_active flag the admin deactivate route uses, and revokes every
// refresh token so already-issued sessions can't keep renewing. This does
// NOT erase the row/related data — that's a separate, deliberately
// irreversible operation better handled by an admin/support request.
exports.deactivateOwnAccount = async (req, res) => {
  try {
    await query('UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1', [req.user.id]);
    await query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Account deactivated' });
  } catch (err) {
    console.error('deactivateOwnAccount error:', err);
    res.status(500).json({ success: false, message: 'Failed to deactivate account' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Valid email required' });
    }
    const result = await query('SELECT id, full_name FROM users WHERE email = $1', [email.toLowerCase()]);
    // Always return success to prevent email enumeration
    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    }
    const user = result.rows[0];
    const resetToken = jwt.sign({ id: user.id, purpose: 'reset' }, process.env.JWT_SECRET, { expiresIn: '1h' });

    const resetUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    try {
      await sendEmail({
        to: email,
        subject: 'Password Reset - WorkBridge ETH',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6366f1;">Password Reset</h2>
            <p>Hi ${user.full_name},</p>
            <p>You requested a password reset. Click the link below to set a new password (expires in 1 hour):</p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">Reset Password</a>
            <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
            <p style="color: #999; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 16px;">Need help? Email <a href="mailto:tesfaykflay75@gmail.com" style="color: #6366f1;">tesfaykflay75@gmail.com</a> or message <a href="https://t.me/go_do369" style="color: #6366f1;">@go_do369</a> on Telegram.</p>
          </div>`
      });
    } catch (emailErr) {
      console.warn('Reset email failed (non-fatal):', emailErr.message);
    }
    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ success: false, message: 'Failed to process request' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !isStrongEnough(newPassword)) {
      return res.status(400).json({ success: false, message: 'Token and a new 8-200 char password are required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    if (decoded.purpose !== 'reset') {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await withTransaction(async (client) => {
      await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, decoded.id]);
      // Revoke all refresh tokens — force re-login everywhere
      await client.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [decoded.id]);
    });
    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ success: false, message: 'Reset failed' });
  }
};

exports.setupOTP = async (req, res) => {
  try {
    const secret = generateOTP();
    await query('UPDATE users SET otp_secret = $1, otp_enabled = false WHERE id = $2', [secret.base32, req.user.id]);
    const qrCode = await generateQrDataURL(secret.otpauth_url);
    res.json({ success: true, data: { secret: secret.base32, qrCode } });
  } catch (err) {
    console.error('setupOTP error:', err);
    res.status(500).json({ success: false, message: 'OTP setup failed (install speakeasy + qrcode)' });
  }
};

exports.verifyAndEnableOTP = async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ success: false, message: 'OTP code required' });
    const result = await query('SELECT otp_secret FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows[0]?.otp_secret) {
      return res.status(400).json({ success: false, message: 'OTP not set up' });
    }
    if (!verifyOTP(token, result.rows[0].otp_secret)) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code' });
    }
    await query('UPDATE users SET otp_enabled = true WHERE id = $1', [req.user.id]);
    res.json({ success: true, message: 'Two-factor authentication enabled' });
  } catch (err) {
    console.error('verifyAndEnableOTP error:', err);
    res.status(500).json({ success: false, message: 'OTP verification failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const result = await query(
      `SELECT id, full_name, username, email, phone, user_type, profile_photo,
              country, region, city, skills, languages, bio, is_verified, is_premium,
              company_name, industry, height_cm, weight_kg, created_at
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch profile' });
  }
};

// Whitelisted profile update — used by /api/auth/me PATCH (if you add it)
exports.updateOwnProfile = async (req, res) => {
  try {
    const updates = {};
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    const setClauses = [];
    const values = [];
    let i = 1;
    for (const [k, v] of Object.entries(updates)) {
      setClauses.push(`${k} = $${i++}`);
      values.push(v);
    }
    values.push(req.user.id);
    const sql = `UPDATE users SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    const result = await query(sql, values);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    delete result.rows[0].password_hash;
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateOwnProfile error:', err);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
};

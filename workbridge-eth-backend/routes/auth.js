const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// Tight limiter for sensitive auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' }
});

router.post('/register', authLimiter, auth.register);
router.post('/login', authLimiter, auth.login);
router.post('/refresh-token', authLimiter, auth.refreshToken);
router.post('/forgot-password', authLimiter, auth.forgotPassword);
router.post('/reset-password', authLimiter, auth.resetPassword);
router.get('/verify-email', auth.verifyEmail);

router.get('/me', protect, auth.me);
router.patch('/me', protect, auth.updateOwnProfile);
router.delete('/me', protect, auth.deactivateOwnAccount);
router.post('/logout', protect, auth.logout);

router.post('/otp/setup', protect, auth.setupOTP);
router.post('/otp/verify', protect, auth.verifyAndEnableOTP);

module.exports = router;

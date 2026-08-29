const express = require('express');
const router = express.Router();
const user = require('../controllers/user.controller');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadSingleImage } = require('../middleware/upload');

// /api/users — public directory listing
router.get('/', user.listUsers);

// /api/users/:id — public profile
router.get('/:id', user.getPublicProfile);

// /api/users/me — current user (must come before /:id)
router.get('/me/profile', protect, user.getProfile);
router.patch('/me/profile', protect, user.updateProfile);
router.post('/me/change-password', protect, user.changePassword);
router.post('/me/photo', protect, uploadSingleImage('photo'), user.uploadPhoto);

module.exports = router;

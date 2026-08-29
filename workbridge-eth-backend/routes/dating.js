const express = require('express');
const router = express.Router();
const dating = require('../controllers/dating.controller');
const { protect } = require('../middleware/auth');

router.post('/profile', protect, dating.createProfile);
router.get('/profile', protect, dating.getMyProfile);
router.patch('/profile', protect, dating.updateProfile);
router.get('/browse', protect, dating.browseProfiles);
router.post('/like/:userId', protect, dating.likeProfile);
router.get('/matches', protect, dating.getMatches);
router.get('/likes', protect, dating.getLikes);
router.post('/block/:userId', protect, dating.blockUser);

module.exports = router;

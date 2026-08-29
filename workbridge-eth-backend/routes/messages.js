const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { protect } = require('../middleware/auth');
const { sendMessage, getConversations, getMessagesWithUser, markAsRead } = require('../controllers/message.controller');

const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// GET /api/messages/conversations — list of users the current user has chatted with,
// plus the latest message preview and unread count. Cheap, paginated, doesn't return
// every message ever.
router.get('/conversations', protect, getConversations);

// GET /api/messages/with/:userId?page=1&limit=50
router.get('/with/:userId', protect, async (req, res) => {
  if (!isUuid(req.params.userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user id' });
  }
  return getMessagesWithUser(req, res);
});

// POST /api/messages — body: { receiver_id, content, message_type?, context_type?, context_id? }
router.post('/', protect, sendMessage);

// POST /api/messages/read — body: { sender_id } marks all messages from sender_id -> me as read
router.post('/read', protect, async (req, res) => {
  if (!req.body?.sender_id || !isUuid(req.body.sender_id)) {
    return res.status(400).json({ success: false, message: 'sender_id required' });
  }
  return markAsRead(req, res);
});

module.exports = router;

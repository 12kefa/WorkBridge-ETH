const { query, withTransaction } = require('../config/database');

const MESSAGE_TYPES = ['text', 'image', 'file', 'voice'];
const CONTEXT_TYPES = ['job', 'service', 'dating', 'general'];
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/**
 * Build a stable conversation key from two user ids (smaller first).
 */
const conversationKey = (a, b) => [a, b].sort().join(':');

/**
 * Send a message. Also touches the conversations table so listing is cheap.
 */
exports.sendMessage = async (req, res) => {
  try {
    const { receiver_id, content, message_type = 'text', context_type, context_id, attachment_url } = req.body || {};

    if (!isUuid(receiver_id)) return res.status(400).json({ success: false, message: 'Valid receiver_id required' });
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'content required' });
    }
    if (content.length > 5000) {
      return res.status(400).json({ success: false, message: 'content must be <= 5000 chars' });
    }
    if (receiver_id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot send message to yourself' });
    }
    if (!MESSAGE_TYPES.includes(message_type)) {
      return res.status(400).json({ success: false, message: 'Invalid message_type' });
    }
    if (context_type && !CONTEXT_TYPES.includes(context_type)) {
      return res.status(400).json({ success: false, message: 'Invalid context_type' });
    }

    // Verify receiver exists
    const recv = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [receiver_id]);
    if (recv.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Receiver not found' });
    }

    const convKey = conversationKey(req.user.id, receiver_id);
    const [userA, userB] = convKey.split(':');

    const result = await withTransaction(async (client) => {
      const m = await client.query(
        `INSERT INTO messages (sender_id, receiver_id, content, message_type, attachment_url, context_type, context_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, receiver_id, content.trim(), message_type, attachment_url || null, context_type || null, context_id || null]
      );
      // Upsert conversation
      await client.query(
        `INSERT INTO conversations (user_a, user_b, last_message_at, last_message_preview)
         VALUES ($1, $2, NOW(), $3)
         ON CONFLICT (user_a, user_b)
         DO UPDATE SET last_message_at = NOW(), last_message_preview = EXCLUDED.last_message_preview`,
        [userA, userB, content.slice(0, 100)]
      );
      return m.rows[0];
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};

/**
 * List all conversations for the current user with last-message preview + unread count.
 */
exports.getConversations = async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id as conversation_id,
              c.last_message_at,
              c.last_message_preview,
              CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END as other_user_id,
              u.full_name as other_user_name,
              u.profile_photo as other_user_photo,
              u.is_verified as other_user_verified,
              (SELECT COUNT(*)::int FROM messages m
                 WHERE m.sender_id = (CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END)
                   AND m.receiver_id = $1
                   AND m.is_read = false) as unread_count
       FROM conversations c
       JOIN users u ON u.id = (CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END)
       WHERE c.user_a = $1 OR c.user_b = $1
       ORDER BY c.last_message_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getConversations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch conversations' });
  }
};

/**
 * Get the message thread between me and another user, paginated.
 */
exports.getMessagesWithUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const result = await query(
      `SELECT m.*, s.full_name as sender_name, s.profile_photo as sender_photo
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       WHERE (m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1)
       ORDER BY m.created_at ASC
       LIMIT $3 OFFSET $4`,
      [req.user.id, userId, limitNum, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getMessagesWithUser error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
};

/**
 * Mark all messages from sender_id -> me as read.
 */
exports.markAsRead = async (req, res) => {
  try {
    const { sender_id } = req.body;
    const result = await query(
      `UPDATE messages SET is_read = true, read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND is_read = false
       RETURNING id`,
      [sender_id, req.user.id]
    );
    res.json({ success: true, data: { marked: result.rowCount } });
  } catch (err) {
    console.error('markAsRead error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark messages as read' });
  }
};

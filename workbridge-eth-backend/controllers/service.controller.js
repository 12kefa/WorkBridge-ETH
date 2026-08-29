const { query, withTransaction } = require('../config/database');

const PRICE_TYPES = ['fixed', 'hourly', 'daily', 'negotiable'];
const ORDER_STATUSES = ['pending', 'in-progress', 'completed', 'cancelled', 'disputed'];
const ALLOWED_SERVICE_FIELDS = [
  'title', 'description', 'category', 'price', 'price_type', 'currency',
  'delivery_time', 'revisions', 'images', 'tags', 'status', 'is_featured'
];
const isUuid = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

exports.createService = async (req, res) => {
  try {
    const { title, description, category, price, price_type, currency, delivery_time, revisions, images, tags } = req.body || {};

    if (!title || title.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'Title required (5+ chars)' });
    }
    if (!description || description.trim().length < 20) {
      return res.status(400).json({ success: false, message: 'Description required (20+ chars)' });
    }
    if (!category) return res.status(400).json({ success: false, message: 'Category required' });
    if (price_type && !PRICE_TYPES.includes(price_type)) {
      return res.status(400).json({ success: false, message: 'Invalid price_type' });
    }

    const result = await query(
      `INSERT INTO services (provider_id, title, description, category, price, price_type, currency, delivery_time, revisions, images, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.user.id, title.trim(), description.trim(), category, price || null, price_type || 'fixed', currency || 'ETB', delivery_time || null, revisions || 1, images || [], tags || []]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('createService error:', err);
    res.status(500).json({ success: false, message: 'Failed to create service' });
  }
};

exports.listServices = async (req, res) => {
  try {
    const { category, search, min_price, max_price, page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    const where = [`s.status = 'active'`];
    const params = [];
    let i = 1;
    if (category) { where.push(`s.category = $${i++}`); params.push(category); }
    if (search) { where.push(`(s.title ILIKE $${i++} OR s.description ILIKE $${i++})`); params.push(`%${search}%`, `%${search}%`); }
    if (min_price) { where.push(`s.price >= $${i++}`); params.push(parseFloat(min_price)); }
    if (max_price) { where.push(`s.price <= $${i++}`); params.push(parseFloat(max_price)); }

    const whereSql = where.join(' AND ');
    const countResult = await query(`SELECT COUNT(*)::int as total FROM services s WHERE ${whereSql}`, params);
    const total = countResult.rows[0].total;

    const result = await query(
      `SELECT s.*, u.full_name as provider_name, u.profile_photo, u.is_verified
       FROM services s JOIN users u ON s.provider_id = u.id
       WHERE ${whereSql}
       ORDER BY s.is_featured DESC, s.rating DESC NULLS LAST, s.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limitNum, offset]
    );
    res.json({
      success: true,
      data: result.rows,
      pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) }
    });
  } catch (err) {
    console.error('listServices error:', err);
    res.status(500).json({ success: false, message: 'Failed to list services' });
  }
};

exports.getService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid service id' });
    const result = await query(
      `SELECT s.*, u.full_name as provider_name, u.profile_photo, u.is_verified, u.bio as provider_bio
       FROM services s JOIN users u ON s.provider_id = u.id WHERE s.id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('getService error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch service' });
  }
};

exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid service id' });
    const check = await query('SELECT provider_id FROM services WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Service not found' });
    if (check.rows[0].provider_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const setClauses = [];
    const values = [];
    let i = 1;
    for (const key of ALLOWED_SERVICE_FIELDS) {
      if (req.body[key] !== undefined) {
        if (key === 'price_type' && !PRICE_TYPES.includes(req.body[key])) {
          return res.status(400).json({ success: false, message: 'Invalid price_type' });
        }
        setClauses.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }
    values.push(id);
    const sql = `UPDATE services SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`;
    const result = await query(sql, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('updateService error:', err);
    res.status(500).json({ success: false, message: 'Failed to update service' });
  }
};

exports.deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid service id' });
    const check = await query('SELECT provider_id FROM services WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Service not found' });
    if (check.rows[0].provider_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await query('DELETE FROM services WHERE id = $1', [id]);
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    console.error('deleteService error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete service' });
  }
};

exports.orderService = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ success: false, message: 'Invalid service id' });
    const { requirements } = req.body || {};

    const serviceResult = await query('SELECT provider_id, price FROM services WHERE id = $1', [id]);
    if (serviceResult.rows.length === 0) return res.status(404).json({ success: false, message: 'Service not found' });
    if (serviceResult.rows[0].provider_id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot order your own service' });
    }

    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO service_orders (service_id, buyer_id, provider_id, requirements, price)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [id, req.user.id, serviceResult.rows[0].provider_id, requirements || null, serviceResult.rows[0].price]
      );
      await client.query('UPDATE services SET orders_count = orders_count + 1 WHERE id = $1', [id]);
      await client.query(
        `INSERT INTO notifications (user_id, title, body, type, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [serviceResult.rows[0].provider_id, 'New Order', 'You received a new service order', 'order', ins.rows[0].id, 'service_order']
      );
      return ins.rows[0];
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('orderService error:', err);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 20, 100);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const offset = (pageNum - 1) * limitNum;

    let sql, params;
    if (req.query.as === 'provider') {
      sql = `SELECT so.*, s.title as service_title, u.full_name as buyer_name
             FROM service_orders so
             JOIN services s ON so.service_id = s.id
             JOIN users u ON so.buyer_id = u.id
             WHERE so.provider_id = $1`;
      params = [req.user.id];
    } else {
      sql = `SELECT so.*, s.title as service_title, u.full_name as provider_name
             FROM service_orders so
             JOIN services s ON so.service_id = s.id
             JOIN users u ON so.provider_id = u.id
             WHERE so.buyer_id = $1`;
      params = [req.user.id];
    }

    if (status) { sql += ` AND so.status = $${params.length + 1}`; params.push(status); }
    sql += ` ORDER BY so.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limitNum, offset);

    const result = await query(sql, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('getOrders error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!isUuid(orderId)) return res.status(400).json({ success: false, message: 'Invalid order id' });
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const check = await query('SELECT provider_id, buyer_id FROM service_orders WHERE id = $1', [orderId]);
    if (check.rows.length === 0) return res.status(404).json({ success: false, message: 'Order not found' });

    const order = check.rows[0];
    if (order.provider_id !== req.user.id && order.buyer_id !== req.user.id && req.user.user_type !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await query(
      'UPDATE service_orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, orderId]
    );
    res.json({ success: true, message: 'Order status updated' });
  } catch (err) {
    console.error('updateOrderStatus error:', err);
    res.status(500).json({ success: false, message: 'Failed to update order' });
  }
};

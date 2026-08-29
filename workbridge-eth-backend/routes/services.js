const express = require('express');
const router = express.Router();
const svc = require('../controllers/service.controller');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/', svc.listServices);
router.post('/', protect, svc.createService);
router.get('/:id', optionalAuth, svc.getService);
router.put('/:id', protect, svc.updateService);
router.delete('/:id', protect, svc.deleteService);
router.post('/:id/order', protect, svc.orderService);

router.get('/orders/list', protect, svc.getOrders);
router.put('/orders/:orderId', protect, svc.updateOrderStatus);

module.exports = router;

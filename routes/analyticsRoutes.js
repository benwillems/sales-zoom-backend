const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');

// GET /api/analytics/appointments
router.get('/analytics/appointments', analyticsController.getAppointmentAnalytics);

module.exports = router;
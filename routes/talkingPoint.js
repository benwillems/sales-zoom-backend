// routes/talkingPointRoutes.js
const express = require('express');
const router = express.Router();
const talkingPointController = require('../controllers/talkingPointController');

// POST /api/talking-points
router.post('/talkingPoints/generate', talkingPointController.generateTalkingPoints);

module.exports = router;

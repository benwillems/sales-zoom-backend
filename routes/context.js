// routes/contextRoutes.js
const express = require('express');
const router = express.Router();
const contextController = require('../controllers/contextController');

// List user/org contexts
router.get('/context/list', contextController.getContexts);

// Update user context
router.patch('/context/:id/update', contextController.patchContext);

// Update default (org) context
router.patch('/default-context/:id/update', contextController.patchDefaultContext);

module.exports = router;

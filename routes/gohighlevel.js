const express = require('express')
const router = express.Router()

// Try destructuring import like your other working files
const { 
  createContactAndAppointment,
  updateAppointment,
  opportunityStatusUpdate
} = require('../controllers/gohighlevelController')

router.post(
  '/gohighlevel/appointment',
  createContactAndAppointment
)
router.post(
  '/gohighlevel/appointment/update',
  updateAppointment
)

router.post(
  '/gohighlevel/opportunity/status',
  opportunityStatusUpdate
)

module.exports = router

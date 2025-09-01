const express = require('express')
const router = express.Router()
const calenderController = require('../controllers/calenderController')
const fileUpload = require('express-fileupload')

router.use(fileUpload()) // This initializes the middleware correctly

router.post(
  '/calender/microsoft',
  calenderController.addMicrosoftCalender
)

module.exports = router // Add this line to export the router
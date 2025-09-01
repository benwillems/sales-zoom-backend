const express = require('express')
const router = express.Router()
const phoneController = require('../controllers/phoneController')
const bodyParser = require('body-parser')
const fileUpload = require('express-fileupload')

router.use(fileUpload())

router.post('/send/call', phoneController.sendCall)
router.get('/process/call/:callId', phoneController.processCall)
router.post('/receive/sms', bodyParser.urlencoded({ extended: false }), phoneController.receiveSms)
router.get('/generate/notes/:checkinId', phoneController.generateNotesForCheckinId)
// router.post('/test/inbody', phoneController.testInBodyScan)

module.exports = router

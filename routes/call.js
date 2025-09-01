const router = require('express').Router();
const callController = require('../controllers/callController');

router.post('/meeting/create', callController.createMeeting);
router.get('/meeting/details', callController.getMeetingDetails);
router.post('/meeting/end/:appointmentId', callController.endMeeting);
router.post('/meeting/start/:appointmentId', callController.startMeeting);
router.post('/meeting/template/:appointmentId', callController.addTemplate);

// / /appointment/:appointmentId/meetingdetails

module.exports = router;

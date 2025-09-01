const router = require('express').Router();
const meetingWebhookController = require('../controllers/meetingWebhookController');
const scheduleController = require('../controllers/scheduleController');

router.post('/start', meetingWebhookController.statedMeeting);
router.post('/end', meetingWebhookController.endedMeeting);
router.post('/recording/complete', meetingWebhookController.recordingCompleted);
router.post('/schedule/webhook/create', scheduleController.createScheduleWebhook);
router.post(
  '/scheduled/event/create',
  scheduleController.createScheduledEventWebhook
)

router.post('/scheduled/event/cancel', scheduleController.cancelScheduledEventWebhook)

module.exports = router;
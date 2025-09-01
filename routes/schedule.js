const router = require('express').Router();
const scheduleController = require('../controllers/scheduleController');

router.get('/schedule', scheduleController.getScheduleDetails);
router.post('/schedule', scheduleController.createSchedule);
router.patch('/schedule', scheduleController.updateSchedule);
router.delete('/schedule', scheduleController.deleteSchedule);
router.patch('/schedule/status', scheduleController.updateScheduleStatus);

module.exports = router;

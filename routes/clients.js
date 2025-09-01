const express = require('express')
const router = express.Router()
const clientController = require('../controllers/clientController')

router.post('/clients', clientController.createClient)

router.get('/clients', clientController.getClients)

router.get('/clients/:clientId', clientController.describeClientById)

router.get(
  '/clients/:clientId/appointments',
  clientController.getAppointmentsByClientId
)

router.post('/search/client', clientController.searchClientRecords)

router.post(
  '/update/client/calorie-goal-breakdown',
  clientController.updateCalorieGoalBreakdown
)

router.post('/update/client/goals', clientController.updateClientsGoals)

router.post('/merge/clients', clientController.mergeClients)

router.post('/update/client', clientController.editClientById)

router.post('/upload/client/image', clientController.uploadClientImage)

router.get('/client/image/:clientId', clientController.getClientImageById)

router.post('/add/checkin', clientController.addCheckInForClient)

router.post('/update/client/:clientId/checkin', clientController.updateClientCheckInSetup)

router.post('/toggle/client/:clientId/checkin', clientController.toggleClientCheckIn)

router.get('/client/:clientId/checkins', clientController.getClientCheckInsById)

router.get('/clients/latest/messages', clientController.getClientsWithLatestMessage)

router.get('/client/:clientId/message', clientController.getMessagesByClientId)

router.post('/client/message', clientController.sendMessageToClient)

router.post('/client/addprogram', clientController.addClientToProgram);

router.get('/client/program/enroll/:programId', clientController.checkEnrollment);

router.post('/client/program/pause/:clientProgramId', clientController.pauseProgramToClient)

router.post('/client/program/cancel/:clientProgramId', clientController.cancelProgramToClient)

router.get('/clients/talkingpoint/:appointmentId', clientController.questionClient)

module.exports = router

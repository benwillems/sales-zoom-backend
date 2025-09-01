const express = require('express')
const router = express.Router()
const appointmentController = require('../controllers/appointmentController')
const fileUpload = require('express-fileupload')

router.use(fileUpload())

router.post(
  '/upload-appointment-pdf',
  appointmentController.uploadAppointmentPDF
)

router.get('/appointments', appointmentController.getAppointments)

router.post('/appointment/start', appointmentController.startAppointment)

router.post('/appointment/stop', appointmentController.stopAppointment)

router.post(
  '/appointment/upload-audio',
  appointmentController.uploadAudioForAnAppointment
)

router.post('/appointment/pause', appointmentController.pauseAppointment)

router.post('/appointment/resume', appointmentController.resumeAppointment)

router.post('/appointment/delete', appointmentController.deleteAppointment)

router.post('/appointment/cancel', appointmentController.cancelAppointment)

router.post('/appointment/schedule', appointmentController.scheduleAppointment)

router.post('/appointment/noshow', appointmentController.markNoshow)

router.post(
  '/update-appointment-notes',
  appointmentController.updateAppointmentNotes
)

router.get('/recent/appointments', appointmentController.getRecentAppointments)

router.get(
  '/scheduled/appointments',
  appointmentController.getScheduledAppointments
)

router.post(
  '/appointment/:appointmentId/attachments',
  appointmentController.uploadAttachments
)

router.get(
  '/appointment/:appointmentId/attachments',
  appointmentController.getAttachments
)

router.get(
  '/appointment/:appointmentId',
  appointmentController.getAppointmentById
)

router.get('/attachment/:attachmentId', appointmentController.getAttachmentById)

router.delete(
  '/attachment/:attachmentId',
  appointmentController.deleteAttachmentById
)

router.post(
  '/appointment/create/email',
  appointmentController.createEmailToSendToClient
)

router.post('/appointment/update/email', appointmentController.updateEmail)

router.post(
  '/appointment/regenerate/email',
  appointmentController.regenerateEmail
)

router.post('/appointment/assign-members', appointmentController.assignMembers)

router.post(
  '/appointment/copy-to-client',
  appointmentController.copyAppointmentToNewClient
)

router.post(
  '/appointment/:appointmentId/audio',
  appointmentController.getAppointmentAudioByAppointmentId
)

router.post(
  '/appointment/:appointmentId/send-email',
  appointmentController.sendEmailForAppointment
)

router.get('/appointment/:appointmentId/meetingdetails', appointmentController.getMeetingDetails);

module.exports = router

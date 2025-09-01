const { HttpError } = require('../errors/HttpError')
const {
  uploadAppointmentPDF,
  getAppointments,
  scheduleAppointment,
  startAppointment,
  stopAppointment,
  pauseAppointment,
  resumeAppointment,
  cancelAppointment,
  markNoshow,
  updateAppointmentNotes,
  deleteAppointment,
  getRecentAppointments,
  getScheduledAppointments,
  uploadAttachments,
  getAttachments,
  getAttachmentById,
  getAppointmentById,
  deleteAttachmentById,
  uploadAudioForAnAppointment,
  generateEmailForNutrisionist,
  updateEmail,
  assignNotesToMembers,
  regenerateEmail,
  getAudioPresignedUrlsByAppointmentId,
  copyAppointmentToNewClient,
  sendEmailAndUpdateAppointment,
  genSignatureService,
} = require('../services/appointmentService')

const { parseBoolean } = require('../utils/audioAppointmentUtils')

exports.getAppointments = async (req, res) => {
  const { status, startDate, endDate, startScheduleDate, endScheduleDate } =
    req.query
  let authSub = req.auth?.sub
  const isUserSpecific = req.query.isUserSpecific == 'true'
  try {
    const appointments = await getAppointments({
      status,
      startDate,
      endDate,
      startScheduleDate,
      endScheduleDate,
      authSub,
      isUserSpecific
    })
    res.status(200).json(appointments)
  } catch (error) {
    console.error('Error getting appointment: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.uploadAppointmentPDF = async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.')
  }

  const { clientId } = req.body
  const authSub = req.auth?.sub

  try {
    const { appointments } = await uploadAppointmentPDF({
      clientId,
      authSub,
      files: req.files,
    })

    return res.status(200).json({ records: appointments })
  } catch (error) {
    console.error('Error uploading appointment PDF:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.scheduleAppointment = async (req, res) => {
  const {
    appointmentId,
    clientId,
    clientName,
    scheduleStartAt,
    scheduleEndAt,
    title,
    description,
    isMultiMembers,
  } = req.body
  const authSub = req.auth?.sub
  try {
    let updateData = {}
    if (scheduleStartAt !== undefined)
      updateData.scheduleStartAt = new Date(scheduleStartAt)
    if (scheduleEndAt !== undefined)
      updateData.scheduleEndAt = new Date(scheduleEndAt)
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    const scheduledAppointment = await scheduleAppointment({
      appointmentId: appointmentId,
      clientName: clientName,
      clientId: clientId,
      scheduleStartAt: new Date(scheduleStartAt),
      scheduleEndAt: new Date(scheduleEndAt),
      title: title,
      description: description,
      updateData: updateData,
      authSub: authSub,
      isMultiMembers: parseBoolean(isMultiMembers),
    })

    return res.status(200).json({
      message: 'Appointment has been scheduled',
      appointment: scheduledAppointment,
    })
  } catch (error) {
    console.error('Error scheduling appointment: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.markNoshow = async (req, res) => {
  const { appointmentId } = req.body
  const authSub = req.auth?.sub
  try {
    const appointment = await markNoshow({
      appointmentId,
      authSub,
    })

    return res.status(200).json({
      message: 'Appointment marked as no show',
    })
  } catch (error) {
    console.error('Error starting marking appointment as no show: ', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.startAppointment = async (req, res) => {
  const { appointmentId, clientName, clientId, isMultiMembers } = req.body
  const authSub = req.auth?.sub
  let input = {}
  input.appointmentId = appointmentId
  input.clientId = clientId
  input.clientName = clientName
  input.authSub = authSub
  input.isMultiMembers = parseBoolean(isMultiMembers)
  try {
    const { newAppointment } = await startAppointment(input)
    return res.status(200).json({
      message: 'Appointment recording started successfully.',
      appointment: newAppointment,
    })
  } catch (error) {
    console.error('Error starting new appointment recording:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.stopAppointment = async (req, res) => {
  const { appointmentId, currentTimer, templateId } = req.body
  const authSub = req.auth?.sub

  try {
    const finalAppointment = await stopAppointment({
      appointmentId,
      authSub,
      files: req.files,
      currentTimer,
      templateId,
    })

    return res.status(200).json({
      appointment: finalAppointment,
    })
  } catch (error) {
    console.error('Error stopping appointment:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.uploadAudioForAnAppointment = async (req, res) => {
  const { appointmentId, templateId } = req.body
  const authSub = req.auth?.sub

  try {
    const finalAppointment = await uploadAudioForAnAppointment({
      appointmentId,
      authSub,
      file: req.files.audioFile,
      templateId,
    })

    return res.status(200).json({
      appointment: finalAppointment,
    })
  } catch (error) {
    console.error('Error stopping appointment:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.pauseAppointment = async (req, res) => {
  const { appointmentId, currentTimer } = req.body
  const authSub = req.auth?.sub

  if (!req.files || !req.files.audioFile) {
    return res.status(400).send('No audio file uploaded.')
  }

  try {
    const newAudioFile = req.files.audioFile
    const pausedAppointment = await pauseAppointment({
      appointmentId,
      currentTimer,
      authSub,
      audioFileBuffer: newAudioFile.data,
    })
    return res.status(200).json({
      message: 'Appointment paused successfully',
      appointment: pausedAppointment,
    })
  } catch (error) {
    console.error('Error during appointment pause operation:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.resumeAppointment = async (req, res) => {
  const { appointmentId } = req.body
  const authSub = req.auth?.sub

  try {
    const updatedAppointment = await resumeAppointment({
      appointmentId,
      authSub,
    })
    res.status(200).json({
      message: 'Appointment resumed successfully',
      appointment: updatedAppointment,
    })
  } catch (error) {
    console.error('Error during appointment resume operation:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.updateAppointmentNotes = async (req, res) => {
  const { appointmentId, updatedNotes } = req.body
  const authSub = req.auth?.sub

  try {
    const updatedAppointment = await updateAppointmentNotes({
      appointmentId,
      updatedNotes,
      authSub,
    })
    res.status(200).json({
      message: 'Appointment notes updated successfully',
      updatedAppointment,
    })
  } catch (error) {
    console.error('Error updating appointment notes:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send(error.message)
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.deleteAppointment = async (req, res) => {
  const { appointmentId } = req.body
  const authSub = req.auth?.sub

  try {
    await deleteAppointment({ appointmentId, authSub })
    res.status(200).json({ message: 'Appointment marked deleted successfully' })
  } catch (error) {
    console.error('Error deleting appointment:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.cancelAppointment = async (req, res) => {
  const { appointmentId } = req.body
  const authSub = req.auth?.sub

  try {
    await cancelAppointment({ appointmentId, authSub })
    return res
      .status(200)
      .json({ message: 'Appointment cancelled successfully' })
  } catch (error) {
    console.error('Error cancelling appointment:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getRecentAppointments = async (req, res) => {
  const authSub = req.auth?.sub

  try {
    const appointments = await getRecentAppointments(authSub)
    return res.status(200).json(appointments)
  } catch (error) {
    console.error('Error fetching recent appointments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.getScheduledAppointments = async (req, res) => {
  const authSub = req.auth?.sub

  try {
    const appointments = await getScheduledAppointments(authSub)
    return res.status(200).json(appointments)
  } catch (error) {
    console.error('Error fetching scheduled appointments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.uploadAttachments = async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.')
  }

  const appointmentId = parseInt(req.params.appointmentId, 10) // Corrected parsing
  const authSub = req.auth?.sub

  try {
    const attachments = await uploadAttachments(
      appointmentId,
      req.files.file,
      authSub
    )
    return res.status(200).json(attachments)
  } catch (error) {
    console.error('Error uploading attachments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

exports.getAttachments = async (req, res) => {
  const appointmentId = parseInt(req.params.appointmentId, 10) // Corrected parsing
  const authSub = req.auth?.sub

  try {
    const attachments = await getAttachments(appointmentId, authSub)
    return res.status(200).json(attachments)
  } catch (error) {
    console.error('Error fetching attachments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

exports.getAttachmentById = async (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId, 10)
  const authSub = req.auth?.sub // Assuming authentication middleware adds this

  try {
    // Fetch the specific attachment and include the presigned URL
    const attachmentWithPresignedUrl = await getAttachmentById(
      attachmentId,
      authSub
    )
    return res.status(200).json(attachmentWithPresignedUrl)
  } catch (error) {
    console.error('Error fetching attachment:', error)

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

exports.getAppointmentById = async (req, res) => {
  const appointmentId = parseInt(req.params.appointmentId, 10)
  const authSub = req.auth?.sub

  try {
    const appointment = await getAppointmentById(appointmentId, authSub)
    return res.status(200).json({ appointment: appointment })
  } catch (error) {
    console.error('Error fetching notes:', error)

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

exports.deleteAttachmentById = async (req, res) => {
  const attachmentId = parseInt(req.params.attachmentId, 10)
  const authSub = req.auth?.sub

  try {
    // Fetch the specific attachment and include the presigned URL
    await deleteAttachmentById(attachmentId, authSub)
    return res.status(200).json({ message: 'Attachment deleted' })
  } catch (error) {
    console.error('Error fetching attachment:', error)

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

exports.createEmailToSendToClient = async (req, res) => {
  const { appointmentId } = req.body
  const authSub = req.auth?.sub

  try {
    const emailWithInstructions = await generateEmailForNutrisionist(
      appointmentId,
      authSub
    )

    return res.status(200).json(emailWithInstructions)
  } catch (error) {
    console.error('Error creating email for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.updateEmail = async (req, res) => {
  const { appointmentId, email } = req.body
  const authSub = req.auth?.sub

  try {
    const updatedEmail = await updateEmail(appointmentId, authSub, email)

    return res.status(200).json(updatedEmail)
  } catch (error) {
    console.error('Error updating email for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.regenerateEmail = async (req, res) => {
  const { appointmentId, selectedEmailBody, howToChangeEmail } = req.body
  const authSub = req.auth?.sub

  try {
    const regeneratedEmail = await regenerateEmail(
      appointmentId,
      authSub,
      selectedEmailBody,
      howToChangeEmail
    )

    return res.status(200).json(regeneratedEmail)
  } catch (error) {
    console.error('Error updating email for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.assignMembers = async (req, res) => {
  const { appointmentId, clientIdToNotes } = req?.body
  const authSub = req.auth?.sub

  try {
    const assigned = await assignNotesToMembers(
      appointmentId,
      clientIdToNotes,
      authSub
    )
    return res.status(200).json(assigned)
  } catch (error) {
    console.error('Error assigning notes to members: ', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.copyAppointmentToNewClient = async (req, res) => {
  const { appointmentId, clientId } = req?.body
  const authSub = req.auth?.sub

  try {
    const copiedAppointment = await copyAppointmentToNewClient(
      appointmentId,
      clientId,
      authSub
    )
    return res.status(200).json(copiedAppointment)
  } catch (error) {
    console.error('Error copying appointment to new client: ', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.getAppointmentAudioByAppointmentId = async (req, res) => {
  const appointmentId = req.params.appointmentId
  const authSub = req.auth?.sub

  try {
    const audioPresignedUrls = await getAudioPresignedUrlsByAppointmentId(
      appointmentId,
      authSub
    )
    return res.status(200).json(audioPresignedUrls)
  } catch (error) {
    console.error('Failed to fetch pre signed urls: ', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.sendEmailForAppointment = async (req, res) => {
  const appointmentId = req.params.appointmentId
  const { emailBody, emailSubject } = req.body
  const authSub = req.auth?.sub

  try {
    const updatedAppointment = await sendEmailAndUpdateAppointment(
      appointmentId,
      emailBody,
      emailSubject,
      authSub
    )
    return res.status(200).json(updatedAppointment)
  } catch (error) {
    console.error('Failed to send email: ', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.getMeetingDetails = async (req, res) => {
  const { appointmentId } = req.params;
  let authSub = req.auth?.sub;
  try {
      const meetingDetails = await genSignatureService({
          appointmentId: parseInt(appointmentId),
          role: 1,
          authSub: authSub
      });
      return res.status(200).json(meetingDetails);
  } catch (error) {
      console.error('Error generating signature:', error);
      if (error instanceof HttpError) {
          return res.status(error.statusCode).json({ error: error.message });
      }
      return res.status(500).json({ error: error.message });
  }
};

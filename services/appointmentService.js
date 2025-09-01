const pdfParse = require('pdf-parse')
const {
  PrismaClient,
  AppointmentStatus,
  AttachmentStatus,
  ProgramStatus,
} = require('@prisma/client')
const prisma = new PrismaClient()
const {
  downloadAndProcessPDF,
  extractSummaryFromPdf,
} = require('../utils/pdfutils')
const {
  getSignedUrl,
  getFileFromS3,
  generateAppointmentPreSignedUrls,
  uploadBufferToS3,
  getPresignedUrl,
} = require('../utils/s3utils')
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} = require('../errors/HttpError')
const {
  mergeAudioFiles,
  extractSummaryFromAudioTranscript,
  transcribeAudio,
  processAudioFiles,
  summaryListToBullet,
  fillDefaults,
  createTranscriptionPdf,
  generateNotesForEmailFromAI,
  renerateEmailFromAppointment,
} = require('../utils/audioAppointmentUtils')
const { v4: uuidv4 } = require('uuid')
const AWS = require('aws-sdk')
const { sendEmail } = require('../utils/communication')
const {
  appointmentTalkingPoints,
  newAppointmentTalkingPoints,
} = require('../utils/checkInUtils')
const { KJUR } = require('jsrsasign');
const {
  accessTokenJsonUtils,
  startUrlUtils,
  zoomUserDetailsUtils,
} = require('../utils/zoomUtils');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-west-2', // e.g., 'us-west-1'
})
const s3 = new AWS.S3()
const fs = require('fs')
const path = require('path')
const os = require('os')
const { start } = require('repl')
const bucketName = process.env.S3_BUCKET_NAME

const uploadAppointmentPDF = async ({ clientId, authSub, files }) => {
  const appointments = []

  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const client = await prisma.client.findUnique({
    where: {
      id: parseInt(clientId),
      organization: {
        id: user.organizationId,
      },
    },
  })

  if (!client) {
    throw new NotFoundError('Client not found in your organization')
  }

  const organizationId = user.organizationId

  for (const fileName in files) {
    const file = files[fileName]
    const pdfData = await pdfParse(file.data)
    const extractedText = pdfData.text
    const uniqueId = uuidv4()
    const uploadKey = `${fileName}-${client.name}-${uniqueId}.pdf`

    await s3
      .upload({
        Bucket: 'vet-assist',
        Key: uploadKey,
        Body: file.data,
      })
      .promise()

    const url = getSignedUrl('vet-assist', uploadKey)
    await downloadAndProcessPDF(url, 1000, client.name)

    const summary = await extractSummaryFromPdf(extractedText)

    for (const visit of summary.visits) {
      const date = visit.date

      const appointment = await prisma.appointment.create({
        data: {
          date: new Date(date),
          notes: visit,
          organizationId,
          clientId: parseInt(clientId),
          status: 'SUCCEEDED',
        },
      })

      appointments.push(appointment)
    }
  }

  return { appointments, organizationId }
}

const getAppointments = async ({
  status,
  startDate,
  endDate,
  startScheduleDate,
  endScheduleDate,
  authSub,
  isUserSpecific
}) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  let statusFilters = []

  // Split the status query parameter into an array and map to the enum, if provided
  if (status) {
    statusFilters = status.split(',').map(s => {
      if (!Object.values(AppointmentStatus).includes(s)) {
        throw new Error(`Invalid status: ${s}`)
      }
      return { status: s }
    })
  }

  const now = new Date();

  await prisma.programToClient.updateMany({
    where: {
      ProgramStatus: ProgramStatus.ACTIVE,
      endDate: {
        lt: now,
      },
    },
    data: {
      ProgramStatus: 'COMPLETED',
    },
  });
  await prisma.programToClient.updateMany({
    where: {
      ProgramStatus: ProgramStatus.SCHEDULED,
      startDate: {
        lt: now,
      },
    },
    data: {
      ProgramStatus: ProgramStatus.ACTIVE,
    },
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const updateTalkingPoints = async () => {
    try {
      const appointmentIds = (
        await prisma.appointment.findMany({
          where: {
            organizationId: user.organizationId,
            status: AppointmentStatus.SCHEDULED,
            scheduleStartAt: {
              gte: todayStart,
              lte: todayEnd,
            },
          },
          select: {
            id: true,
          },
        })
      ).map(appointment => appointment.id);

      const limit = 5;

      for (let i = 0; i < appointmentIds.length; i += limit) {
        const batch = appointmentIds.slice(i, i + limit);
        await Promise.all(
          batch.map(appointmentId => appointmentTalkingPoints({
            appointmentId: appointmentId,
          }))
        );
      }
    } catch (error) {
      console.error('Error updating talking points:', error);
    }
  };

  // updateTalkingPoints();

  const query = {
    where: {
      organizationId: user.organizationId,
      AND: [
        statusFilters.length ? { OR: statusFilters } : undefined,
        {
          OR: [
            // Checks if the date is within the specified range
            startDate && endDate
              ? {
                date: {
                  gte: new Date(startDate),
                  lte: new Date(endDate),
                },
              }
              : undefined,
            // Checks if the scheduled start and end dates are within the specified range
            startScheduleDate && endScheduleDate
              ? {
                AND: [
                  { scheduleStartAt: { gte: new Date(startScheduleDate) } },
                  { scheduleEndAt: { lte: new Date(endScheduleDate) } },
                ],
              }
              : undefined,
          ].filter(condition => condition !== undefined),
        },
      ].filter(condition => condition !== undefined),
    },
    include: {
      user: true,
      client: {
        include: {
          ProgramToClient: {
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              program: true,
            },
            take: 1,
          },
        },
      },
      zoomMeeting: {
        select: {
          meetingJoinUrl: true,
        }
      }
    },
  }

  let appointments = await prisma.appointment.findMany(query)
  if (isUserSpecific && user.id) {
    appointments = appointments.filter(
      appointment => appointment.userId === user.id
    )
  }
  return appointments
}

const scheduleAppointment = async input => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: input.authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  if (input.appointmentId) {
    let appointment = await prisma.appointment.findUnique({
      where: {
        id: parseInt(input.appointmentId),
      },
    })
    if (appointment.status != AppointmentStatus.SCHEDULED) {
      throw new BadRequestError(
        'Cannot update schedule appointment field for non-scheduled appointment'
      )
    }
    appointment = await prisma.appointment.update({
      where: { id: parseInt(input.appointmentId) },
      data: input.updateData,
      include: {
        client: { select: { id: true, name: true } },
      },
    })
    return appointment
  }

  let client
  if (input.clientId) {
    client = await prisma.client.findFirst({
      where: {
        id: parseInt(input.clientId),
        organization: {
          id: user.organizationId,
        },
      },
    })
  } else {
    if (!input.clientName) {
      throw new BadRequestError('No client name provided')
    }
    client = await prisma.client.create({
      data: {
        name: input.clientName,
        organizationId: user.organizationId,
      },
    })
  }

  const scheduledAppointment = await prisma.appointment.create({
    data: {
      status: AppointmentStatus.SCHEDULED,
      organization: {
        connect: { id: user.organizationId }
      },
      client: {
        connect: { id: parseInt(client.id) }
      },
      scheduleStartAt: input.scheduleStartAt,
      scheduleEndAt: input.scheduleEndAt,
      title: input.title,
      description: input.description,
      isMultiMembers: input.isMultiMembers,
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  })

  newAppointmentTalkingPoints({
    scheduledAppointment: scheduledAppointment,
  })

  return scheduledAppointment
}

const startAppointment = async input => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: input.authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }
  const appointmentDate = new Date()
  if (input.appointmentId) {
    const appointment = await prisma.appointment.update({
      where: { id: parseInt(input.appointmentId) },
      data: {
        date: appointmentDate,
        status: AppointmentStatus.RECORDING,
        appointmentType: 'AudioRecording',
        currentTimerMili: 0,
        userId: user.id,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    })
    return { newAppointment: appointment }
  }

  let client
  if (input.clientId) {
    client = await prisma.client.findUnique({
      where: {
        id: parseInt(input.clientId),
        organization: {
          id: user.organizationId,
        },
      },
    })
  } else {
    if (!input.clientName) {
      throw new BadRequestError('No client name provided')
    }
    client = await prisma.client.create({
      data: {
        name: input.clientName,
        organizationId: user.organizationId,
      },
    })
  }

  if (!client) {
    throw new NotFoundError('Client not found in your organization')
  }

  // Update previous "Paused" or "Recording" appointments to "Failed"
  await prisma.appointment.updateMany({
    where: {
      clientId: parseInt(client.id),
      OR: [
        { status: AppointmentStatus.PAUSED },
        { status: AppointmentStatus.RECORDING },
      ],
      organizationId: user.organizationId,
    },
    data: {
      status: AppointmentStatus.FAILED,
      errorReason: 'Aborted because a new appointment was started',
    },
  })

  const newAppointment = await prisma.appointment.create({
    data: {
      date: appointmentDate,
      status: AppointmentStatus.RECORDING,
      organizationId: user.organizationId,
      clientId: parseInt(client.id),
      appointmentType: 'AudioRecording',
      title: `Walk-in for ${client.name}`,
      currentTimerMili: 0,
      isMultiMembers: input.isMultiMembers,
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  })

  return { client, newAppointment }
}

const stopAppointment = async ({
  appointmentId,
  authSub,
  files,
  currentTimer,
  templateId,
}) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        uniqueAuthId: authSub,
      },
    })
    if (!user) {
      throw new NotFoundError('User not found')
    }

    if (!user.organizationId) {
      throw new NotFoundError('Organization not found for given user')
    }

    const appointment = await prisma.appointment.findUnique({
      where: {
        id: parseInt(appointmentId),
        organization: {
          id: user.organizationId,
        },
      },
    })

    if (!appointment) {
      throw new NotFoundError('Appointment not found.')
    }

    if (
      appointment.status == AppointmentStatus.SUCCEEDED ||
      appointment.status == AppointmentStatus.PROCESSING ||
      appointment.status == AppointmentStatus.GENERATING_NOTES
    ) {
      return {
        appointment: appointment,
      }
    }

    if (
      appointment.status != AppointmentStatus.RECORDING &&
      appointment.status != AppointmentStatus.PAUSED
    ) {
      throw new BadRequestError(
        'Only recording or paused appointments can be stopped'
      )
    }
    const talkingPoint = appointment.talkingPoints
    const timestamp = Date.now()
    const key = `appointments/${appointmentId}/${timestamp}.mp3`

    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        status: AppointmentStatus.PROCESSING,
        userId: user.id
      },
    })

    const client = await prisma.client.findUnique({
      where: {
        id: parseInt(appointment.clientId),
      },
    })

    // const oldAudioFile = appointment.recordingUrl
    //   ? await getFileFromS3(appointment.recordingUrl)
    //   : null
    // let finalAudioBuffer = null

    // if (!files || Object.keys(files).length === 0) {
    //   if (oldAudioFile == null) {
    //     throw new BadRequestError(
    //       'No audio file or previous paused appointment found.'
    //     )
    //   }
    //   finalAudioBuffer = oldAudioFile.buffer
    // } else {
    //   const newAudioFile = files['audioFile']
    //   if (oldAudioFile != null) {
    //     finalAudioBuffer = await mergeAudioFiles(
    //       oldAudioFile.buffer,
    //       newAudioFile.data
    //     )
    //   } else {
    //     finalAudioBuffer = newAudioFile.data
    //   }

    //   // Upload merged audio to S3 and update recording URL in the database
    //   await uploadBufferToS3(finalAudioBuffer, bucketName, key)
    // }
    if (files && Object.keys(files).length > 0) {
      await uploadBufferToS3(files['audioFile'].data, bucketName, key)
    }

    // const presignedUrl = await getPresignedUrl(
    //   bucketName,
    //   key
    // )
    const presignedUrls = await generateAppointmentPreSignedUrls(
      appointmentId,
      appointment.isMultiMembers
    )
    const transcription = await processAudioFiles(presignedUrls)
    // const transcription = await transcribeAudio(finalAudioBuffer, presignedUrl)
    console.log('Finished transcription')
    console.log('Transcription: ' + transcription)
    const uniqueId = uuidv4()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcripts-'))
    const transcriptionPdfFileName = path.join(
      tempDir,
      `Transcription-${client.name}-${uniqueId}.pdf`
    )
    await createTranscriptionPdf(transcriptionPdfFileName, transcription)

    // Upload transcription PDF to S3
    const pdfData = fs.readFileSync(transcriptionPdfFileName)
    const result = await s3
      .upload({
        Bucket: bucketName,
        Key: transcriptionPdfFileName,
        Body: pdfData,
      })
      .promise()
    console.log('Transcript Upload finished')
    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        recordingUrl: key,
        status: AppointmentStatus.GENERATING_NOTES,
      },
    })
    const template = await prisma.template.findUnique({
      where: {
        id: parseInt(templateId),
      },
    })

    const notesTemplate = template.notesTemplate

    const defaultsForNotes = notesTemplate.defaults
    const notesOrder = notesTemplate.order ? notesTemplate.order : []

    delete notesTemplate.defaults
    delete notesTemplate.order

    let totalSummary = await extractSummaryFromAudioTranscript(
      transcription,
      notesTemplate,
      client,
      appointment.isMultiMembers,
      talkingPoint
    )

    const totalScore = totalSummary?.arguments?.talkingPointScore?.score?.total
    const obtainedScore =
      totalSummary?.arguments?.talkingPointScore?.score?.score
    const talkingPointScore = totalSummary?.arguments?.talkingPointScore

    function removeTalkingPointScore(data) {
      let jsonData = typeof data === "string" ? JSON.parse(data) : data;
      if (jsonData?.arguments?.talkingPointScore) {
        delete jsonData.arguments.talkingPointScore;
      }
      return jsonData;
    }

    summary = removeTalkingPointScore(totalSummary);

    console.log('Notes Created from AI', summary)
    if (defaultsForNotes && defaultsForNotes.objective) {
      let summaryWithDefaults = fillDefaults(
        summary.visit.objective,
        defaultsForNotes.objective
      )
      summary.visit.objective = summaryWithDefaults
    }

    if (summary?.visit?.calorie_goal_breakdown) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          calorieGoalBreakdown: summary.visit.calorie_goal_breakdown,
        },
      })
    }

    if (summary?.visit?.goals && Array.isArray(summary.visit.goals)) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          goals: summary.visit.goals,
        },
      })
    }
    let status
    let notes
    if (appointment.isMultiMembers) {
      notes = summary.clients.map(client => {
        return { ...summaryListToBullet(client.visit, notesOrder) }
      })
      status = AppointmentStatus.SUCCEEDED_MULTI
    } else {
      notes = summaryListToBullet(summary.visit, notesOrder)
      status = AppointmentStatus.SUCCEEDED
      // sendEmail(summary.visit, client, user)
    }
    // const summaryPdfFileName = `Summary-${client.name}-${uniqueId}.pdf`;
    // await createSummaryPdf(summaryPdfFileName, summary.visit, client, appointmentDate);
    // const url = getSignedUrl(bucketName, transcriptionPdfFileName);
    // console.log("Downloading")
    // await downloadAndProcessPDF(url, 1000, client.name)
    const finalAppointment = await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        notes: notes,
        status: status,
        currentTimerMili: parseInt(currentTimer),
        templateId: parseInt(templateId),
        totalScore: parseFloat(totalScore),
        obtainedScore: parseFloat(obtainedScore),
        talkingPointScore: talkingPointScore
      },
      include: {
        client: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    })
    await prisma.client.update({
      where: { id: finalAppointment.clientId },
      data: {
        lastAppointmentDate: new Date(Date.now()),
      },
    })

    try {
      fs.unlinkSync(transcriptionPdfFileName)
      fs.rmdirSync(tempDir)
    } catch (error) {
      console.log('Error with fs unlink: ', error)
    }

    return {
      appointment: finalAppointment,
    }
  } catch (error) {
    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        errorReason: error.message,
        status: AppointmentStatus.FAILED,
        templateId: parseInt(templateId),
      },
    })
    throw error
  }
}

const uploadAudioForAnAppointment = async ({
  appointmentId,
  authSub,
  file,
  templateId,
}) => {
  try {
    const user = await prisma.user.findFirst({
      where: {
        uniqueAuthId: authSub,
      },
    })

    if (!user) {
      throw new NotFoundError('User not found')
    }

    if (!user.organizationId) {
      throw new NotFoundError('Organization not found for given user')
    }

    const appointment = await prisma.appointment.findUnique({
      where: {
        id: parseInt(appointmentId),
        organization: {
          id: user.organizationId,
        },
      },
    })

    if (!appointment) {
      throw new NotFoundError('Appointment not found.')
    }

    if (appointment.status === AppointmentStatus.SUCCEEDED) {
      return {
        appointment: appointment,
      }
    }

    const key = `appointments/${appointmentId}/${appointment.scheduleStartAt}.mp3`

    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        status: AppointmentStatus.PROCESSING,
      },
    })

    const client = await prisma.client.findUnique({
      where: {
        id: parseInt(appointment.clientId),
      },
    })

    const audioFile = file
    const audioBuffer = audioFile.data

    // Upload audio to S3 and update recording URL in the database
    await uploadBufferToS3(audioBuffer, bucketName, key)

    const presignedUrl = await getPresignedUrl(bucketName, key)
    const transcription = await transcribeAudio(
      audioBuffer,
      presignedUrl,
      appointment.isMultiMembers
    )
    console.log('Finished transcription')
    console.log('Transcription: ' + transcription)

    const uniqueId = uuidv4()
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcripts-'))
    const transcriptionPdfFileName = path.join(
      tempDir,
      `Transcription-${client.name}-${uniqueId}.pdf`
    )
    await createTranscriptionPdf(transcriptionPdfFileName, transcription.text)

    // Upload transcription PDF to S3
    const pdfData = fs.readFileSync(transcriptionPdfFileName)
    const result = await s3
      .upload({
        Bucket: bucketName,
        Key: transcriptionPdfFileName,
        Body: pdfData,
      })
      .promise()
    console.log('Transcript Upload finished')

    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        recordingUrl: key,
        status: AppointmentStatus.GENERATING_NOTES,
      },
    })
    const template = await prisma.template.findUnique({
      where: {
        id: parseInt(templateId),
      },
    })
    const notesTemplate = template.notesTemplate

    const defaultsForNotes = notesTemplate.defaults
    const notesOrder = notesTemplate.order ? notesTemplate.order : []

    delete notesTemplate.defaults
    delete notesTemplate.order

    let summary = await extractSummaryFromAudioTranscript(
      transcription.text,
      notesTemplate,
      client,
      appointment.isMultiMembers
    )

    if (summary?.visit?.calorie_goal_breakdown) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          calorieGoalBreakdown: summary.visit.calorie_goal_breakdown,
        },
      })
    }

    if (summary?.visit?.goals && Array.isArray(summary.visit.goals)) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          goals: summary.visit.goals,
        },
      })
    }

    console.log('Notes Created from AI', summary)

    if (defaultsForNotes && defaultsForNotes.objective) {
      let summaryWithDefaults = fillDefaults(
        summary.visit.objective,
        defaultsForNotes.objective
      )
      summary.visit.objective = summaryWithDefaults
    }

    let status
    let notes
    if (appointment.isMultiMembers) {
      notes = summary.clients.map(client => {
        return { ...summaryListToBullet(client.visit, notesOrder) }
      })
      status = AppointmentStatus.SUCCEEDED_MULTI
    } else {
      notes = summaryListToBullet(summary.visit, notesOrder)
      status = AppointmentStatus.SUCCEEDED
      // sendEmail(summary.visit, client, user)
    }

    const finalAppointment = await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        notes: notes,
        status: status,
        date: appointment.scheduleStartAt,
        templateId: parseInt(templateId),
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
        template: { select: { id: true, name: true } },
      },
    })

    await prisma.client.update({
      where: { id: finalAppointment.clientId },
      data: {
        lastAppointmentDate: new Date(Date.now()),
      },
    })

    try {
      fs.unlinkSync(transcriptionPdfFileName)
      fs.rmdirSync(tempDir)
    } catch (error) {
      console.log('Error with fs unlink: ', error)
    }

    return {
      appointment: finalAppointment,
    }
  } catch (error) {
    await prisma.appointment.update({
      where: { id: parseInt(appointmentId) },
      data: {
        errorReason: error.message,
        status: AppointmentStatus.FAILED,
        templateId: parseInt(templateId),
      },
    })
    throw error
  }
}

const pauseAppointment = async ({
  appointmentId,
  currentTimer,
  authSub,
  audioFileBuffer,
}) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.RECORDING) {
    throw new BadRequestError(
      'Appointment cannot be paused is not recording currently.'
    )
  }

  // let finalAudioFileBuffer = audioFileBuffer
  // if (appointment.recordingUrl) {
  //   const oldAudioFile = await getFileFromS3(appointment.recordingUrl)
  //   finalAudioFileBuffer = await mergeAudioFiles(
  //     oldAudioFile.buffer,
  //     audioFileBuffer
  //   )
  // }
  if (audioFileBuffer && audioFileBuffer.length > 0) {
    const timestamp = Date.now()
    const key = `appointments/${appointmentId}/${timestamp}.mp3`
    const s3Url = await uploadBufferToS3(audioFileBuffer, bucketName, key)

    console.log(`Audio file uploaded to S3: ${s3Url}`)
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: {
      recordingUrl: `appointments/${appointmentId}`,
      status: AppointmentStatus.PAUSED,
      currentTimerMili: parseInt(currentTimer),
      userId: null
    },
    include: {
      client: { select: { id: true, name: true } },
    },
  })

  return updatedAppointment
}

const resumeAppointment = async ({ appointmentId, authSub }) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.PAUSED) {
    throw new BadRequestError(
      'Appointment cannot be resumed is not paused currently.'
    )
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { status: AppointmentStatus.RECORDING, userId: user.id },
    include: {
      client: { select: { id: true, name: true } },
    },
  })

  return updatedAppointment
}

const updateAppointmentNotes = async ({
  appointmentId,
  updatedNotes,
  authSub,
}) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { notes: updatedNotes },
  })

  return updatedAppointment
}

const deleteAppointment = async ({ appointmentId, authSub }) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (
    appointment.status !== AppointmentStatus.SUCCEEDED &&
    appointment.status !== AppointmentStatus.SCHEDULED &&
    appointment.status !== AppointmentStatus.USER_CANCELLED
  ) {
    throw new BadRequestError(
      'Appointment not in succeeded, scheduled or user cancelled status.'
    )
  }

  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { 
      status: AppointmentStatus.USER_DELETED,
      userId: user.id 
    },
  })
}

const cancelAppointment = async ({ appointmentId, authSub }) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (
    appointment.status === AppointmentStatus.SUCCEEDED ||
    appointment.status === AppointmentStatus.FAILED ||
    appointment.status === AppointmentStatus.GENERATING_NOTES ||
    appointment.status === AppointmentStatus.PROCESSING
  ) {
    throw new BadRequestError(
      'Appointment is already post recording and stage and cannot be cancelled'
    )
  }

  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { 
      status: AppointmentStatus.USER_CANCELLED,
      userId: user.id
   },
  })
}

const getRecentAppointments = async authSub => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const twelveHoursAgo = new Date(new Date().getTime() - 12 * 60 * 60 * 1000)

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { status: AppointmentStatus.PAUSED },
        {
          AND: [
            { status: { not: AppointmentStatus.RECORDING } },
            { status: { not: AppointmentStatus.USER_DELETED } },
            { status: { not: AppointmentStatus.FAILED } },
            { createdAt: { gte: twelveHoursAgo } },
          ],
        },
      ],
    },
    include: {
      organization: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
  })

  return appointments
}

const getScheduledAppointments = async authSub => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      organizationId: user.organizationId,
      status: AppointmentStatus.SCHEDULED,
    },
    include: {
      organization: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
  })

  return appointments
}

const uploadAttachments = async (appointmentId, file, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  const uploadKey = `attachments/${appointmentId}/${new Date().toISOString()}-${file.name
    }`

  // Upload file to S3
  await s3
    .upload({
      Bucket: bucketName,
      Key: uploadKey,
      Body: file.data,
    })
    .promise()

  // Create an attachment record in the database
  const attachment = await prisma.attachment.create({
    data: {
      name: file.name,
      appointmentId: parseInt(appointmentId),
      attachmentUrl: uploadKey,
      metadata: JSON.stringify({ name: file.name }),
      status: AttachmentStatus.SUCCEEDED,
    },
  })

  return attachment
}

const getAttachments = async (appointmentId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organization: {
        id: user.organizationId,
      },
    },
    include: {
      attachments: {
        where: {
          status: AttachmentStatus.SUCCEEDED,
        },
      },
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  return appointment.attachments
}

const getAttachmentById = async (attachmentId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const attachment = await prisma.attachment.findUnique({
    where: {
      id: parseInt(attachmentId),
      appointment: {
        organizationId: user.organizationId,
      },
    },
    include: {
      appointment: true,
    },
  })

  if (!attachment) {
    throw new NotFoundError('Attachment not found')
  }

  const presignedUrl = await getPresignedUrl(
    bucketName,
    attachment.attachmentUrl
  )

  return {
    ...attachment,
    presignedUrl,
  }
}

const deleteAttachmentById = async (attachmentId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const attachment = await prisma.attachment.findUnique({
    where: {
      id: parseInt(attachmentId),
      appointment: {
        organizationId: user.organizationId,
      },
    },
    include: {
      appointment: true,
    },
  })

  if (!attachment) {
    throw new NotFoundError('Attachment not found')
  }

  await prisma.attachment.update({
    where: { id: parseInt(attachmentId) },
    data: {
      status: AttachmentStatus.USER_DELETED,
    },
  })
}

const markNoshow = async ({ appointmentId, authSub }) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status != AppointmentStatus.SCHEDULED && appointment.status != AppointmentStatus.MEETING_STARTED && appointment.status != AppointmentStatus.MEETING_ENDED) {
    throw new BadRequestError(
      'Appointment is already post recording and stage and cannot be cancelled'
    )
  }

  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { 
      status: AppointmentStatus.NO_SHOW,
      userId: user.id
    },
  })
}

const getAppointmentById = async (appointmentId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: {
        select: {
          id: true,
          name: true
        },
      }
    }
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  return appointment
}

const generateEmailForNutrisionist = async (appointmentId, authSub) => {
  // Nutrisionist who serviced the pet
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED) {
    throw new BadRequestError('Appointment not in succeeded status.')
  }

  const client = appointment.client

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const instructionsForEmail = await generateNotesForEmailFromAI(
    JSON.stringify(appointment.notes),
    client
    // user
  )

  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { email: instructionsForEmail },
  })

  return {
    emailBody: instructionsForEmail,
  }
}

const updateEmail = async (appointmentId, authSub, email) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED) {
    throw new BadRequestError('Appointment not in succeeded status.')
  }

  const client = appointment.client

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { email: email },
  })

  return {
    emailBody: email,
  }
}

const regenerateEmail = async (
  appointmentId,
  authSub,
  selectedEmailBody,
  howToChangeEmail
) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findFirst({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED) {
    throw new BadRequestError('Appointment not in succeeded status.')
  }

  const client = appointment.client

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const regeneratedEmail = await renerateEmailFromAppointment(
    JSON.stringify(selectedEmailBody),
    JSON.stringify(howToChangeEmail)
  )

  let updatedEmail

  if (selectedEmailBody === appointment.email) {
    // If the entire email body is selected, replace it with the regeneratedEmail
    updatedEmail = regeneratedEmail
  } else {
    // If a section of the email is selected, update that specific section
    const sectionIndex = appointment.email.indexOf(selectedEmailBody)

    if (sectionIndex !== -1) {
      const updatedAppointmentEmail = appointment.email.replace(
        selectedEmailBody,
        regeneratedEmail
      )
      updatedEmail = updatedAppointmentEmail
    } else {
      updatedEmail = appointment.email + '\n\n' + regeneratedEmail
    }
  }

  // Update the appointment record in the database with the updated email field
  await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: { email: updatedEmail },
  })

  return {
    emailBody: updatedEmail,
  }
}

const assignNotesToMembers = async (
  appointmentId,
  clientIdToNotes,
  authSub
) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED_MULTI) {
    throw new BadRequestError('Appointment not in succeeded multi status.')
  }

  const clientIds = Object.keys(clientIdToNotes).map(clientId =>
    parseInt(clientId, 10)
  )

  const clients = await prisma.client.findMany({
    where: {
      id: {
        in: clientIds,
      },
      organizationId: user.organizationId,
    },
    select: {
      id: true,
    },
  })

  if (clients.length != clientIds.length) {
    throw new BadRequestError(
      'All client do not belong to the given organization'
    )
  }

  const updatedAppointment = await prisma.appointment.update({
    where: { id: parseInt(appointmentId) },
    data: {
      status: AppointmentStatus.SUCCEEDED,
      notes: clientIdToNotes[appointment.clientId],
      isMultiMembers: false,
    },
  })
  // Create a list of promises for creating appointments
  const appointmentPromises = clientIds.map(clientId => {
    if (clientId != appointment.clientId)
      return prisma.appointment.create({
        data: {
          clientId: parseInt(clientId, 10),
          status: AppointmentStatus.SUCCEEDED,
          title: appointment.title,
          date: appointment.date,
          createdAt: appointment.createdAt,
          updatedAt: appointment.updatedAt,
          description: appointment.description,
          notes: clientIdToNotes[clientId],
          recordingUrl: appointment.recordingUrl,
          scheduleStartAt: appointment.scheduleStartAt,
          scheduleEndAt: appointment.scheduleEndAt,
          organizationId: appointment.organizationId,
          templateId: appointment.templateId,
          isMultiMembers: false,
        },
      })
  })

  try {
    // Execute all promises using Promise.all
    const results = await Promise.all(appointmentPromises)
    console.log('Appointments created successfully:', results)
  } catch (error) {
    console.error('Error creating appointments:', error)
    throw new error()
  }
}

const copyAppointmentToNewClient = async (appointmentId, clientId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  const client = await prisma.client.findUnique({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new BadRequestError(
      'Client does not belong to the given organization'
    )
  }

  // Extract the client's first name from the full name
  const [firstName] = client.name.split(' ')

  // Extract the client's name from the original notes.summary
  const originalClientName = appointment.notes.summary.split("'s")[0]
  // Create a new notes object by replacing the original client's name with the new client's first name
  const newNotes = {
    ...appointment.notes,
    summary: appointment.notes.summary.replace(originalClientName, firstName),
  }

  const copiedAppointment = await prisma.appointment.create({
    data: {
      clientId: parseInt(clientId, 10),
      status: appointment.status,
      title: appointment.title,
      date: appointment.date,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: appointment.description,
      notes: newNotes,
      recordingUrl: appointment.recordingUrl,
      scheduleStartAt: appointment.scheduleStartAt,
      scheduleEndAt: appointment.scheduleEndAt,
      organizationId: appointment.organizationId,
      templateId: appointment.templateId,
      isMultiMembers: false,
    },
  })

  return copiedAppointment
}

const getAudioPresignedUrlsByAppointmentId = async (appointmentId, authSub) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED) {
    throw new BadRequestError('Appointment not in succeeded status.')
  }

  const presignedUrls = await generateAppointmentPreSignedUrls(
    appointment.recordingUrl.split('/')[1]
  )

  return presignedUrls
}

const sendEmailAndUpdateAppointment = async (
  appointmentId,
  emailBody,
  emailSubject,
  authSub
) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const appointment = await prisma.appointment.findUnique({
    where: {
      id: parseInt(appointmentId),
      organizationId: user.organizationId,
    },
    include: {
      client: true,
    },
  })

  if (!appointment) {
    throw new NotFoundError('Appointment not found')
  }

  if (appointment.status !== AppointmentStatus.SUCCEEDED) {
    throw new BadRequestError('Appointment not in succeeded status.')
  }

  if (!appointment.client || !appointment.client.email) {
    throw new BadRequestError('Client email was not found.')
  }

  try {
    await sendEmail(emailBody, emailSubject, appointment.client.email, user.fromEmailId)

    // Update the appointment's emailSent field to true
    const updatedAppointment = await prisma.appointment.update({
      where: {
        id: parseInt(appointmentId),
      },
      data: {
        emailSent: true,
        emailSubject: emailSubject,
      },
    })

    return updatedAppointment
  } catch (error) {
    console.error('Failed to send email:', error)
    throw new Error('Failed to send email')
  }
}

const genSignatureService = async ({ appointmentId, role, authSub }) => {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
    include: {
      organization: true,
    },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  if (!user.organizationId) {
    throw new NotFoundError('Organization not found for given user')
  }

  const updateAppointment = await prisma.appointment.update({
    where: {
      id: appointmentId
    },
    data: {
      userId: user.id,
    }
  })

  if (!updateAppointment) {
    throw new NotFoundError('Appointment update failed')
  }



  const meetingDetails = await prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      organizationId: user.organizationId
    },
    select: {
      zoomMeeting: {
        select: {
          meetingId: true,
          meetingPassword: true,
        }
      }
    },
  });
  const key = process.env.ZOOM_SIGN_KEY;
  const secret = process.env.ZOOM_SIGN_SECRET;
  const iat = Math.round(new Date().getTime() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const oHeader = { alg: 'HS256', typ: 'JWT' };
  if (!meetingDetails || !meetingDetails.zoomMeeting) {
    throw new NotFoundError("Meeting not found for appointment")
  }
  const meetingId = meetingDetails.zoomMeeting.meetingId.toString();

  const oPayload = {
    sdkKey: key,
    mn: meetingId,
    role: role,
    iat: iat,
    exp: exp,
    tokenExp: exp,
  };
  const sHeader = JSON.stringify(oHeader);
  const sPayload = JSON.stringify(oPayload);
  const sdkJWT = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, secret);

  const meetingUrl = process.env.ZOOM_API_URL + 'meetings/' + meetingId;


  const accessTokenRes = await accessTokenJsonUtils();

  const accessToken = accessTokenRes.access_token;

  let zoomUserId = user.zoomUserId;

  let userId = 'me';
  if (zoomUserId && zoomUserId != '') {
      userId = zoomUserId
  }
  console.log('Zoom User ID: ', userId);

  const zoomUserDetails = await zoomUserDetailsUtils({ accessToken,  userId });

  const startUrlRes = await startUrlUtils({ meetingUrl, accessToken });

  const zakToken = startUrlRes?.start_url.split('zak=')[1];

  const returnData = {
    signature: sdkJWT,
    zakToken: zakToken,
    sdkKey: key,
    meetingId: meetingId,
    userName: zoomUserDetails?.display_name,
    userEmail: zoomUserDetails?.email,
    meetingPassword: meetingDetails.zoomMeeting.meetingPassword.toString(),
    joinUrl: startUrlRes?.join_url,
  };

  return returnData;
};

module.exports = {
  uploadAppointmentPDF,
  getAppointments,
  scheduleAppointment,
  startAppointment,
  stopAppointment,
  uploadAudioForAnAppointment,
  pauseAppointment,
  resumeAppointment,
  updateAppointmentNotes,
  deleteAppointment,
  getRecentAppointments,
  getScheduledAppointments,
  uploadAttachments,
  getAttachments,
  getAttachmentById,
  getAppointmentById,
  deleteAttachmentById,
  cancelAppointment,
  markNoshow,
  generateEmailForNutrisionist,
  updateEmail,
  regenerateEmail,
  assignNotesToMembers,
  copyAppointmentToNewClient,
  getAudioPresignedUrlsByAppointmentId,
  sendEmailAndUpdateAppointment,
  genSignatureService,
}

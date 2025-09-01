const { NotFoundError, BadRequestError, ForbiddenError } = require('../errors/HttpError') // Ensure this is correctly imported
const { PrismaClient, MessageType, MessageOwner, ProgramStatus, AppointmentStatus } = require('@prisma/client');
const clientScheduleService = require('./clientScheduleService')
const { cleanUpPhoneNumber, generateTemplateFromGoal, appointmentTalkingPoints } = require('../utils/checkInUtils')
const { sendSms } = require('../utils/phoneUtils')
const {
  formatNotes,
  answerQuestionsAboutRecords,
} = require('../utils/searchutils')
const {
  getPresignedUrl,
} = require('../utils/s3utils')
const AWS = require('aws-sdk')
const prisma = new PrismaClient()
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-west-2', // e.g., 'us-west-1'
})
const s3 = new AWS.S3()
const bucketName = process.env.S3_BUCKET_NAME

const createClient = async ({ name, phone, email, authSub }) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found for the given auth ID')
  }

  phone = cleanUpPhoneNumber(phone)

  const client = await prisma.client.create({
    data: {
      name,
      phone,
      email,
      organizationId: user.organizationId,
    },
  })

  return client
}

const getClients = async authSub => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  });

  if (!user) {
    throw new NotFoundError('User not found for the given unique ID');
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
      ProgramStatus: ProgramStatus.COMPLETED,
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

  const clients = await prisma.client.findMany({
    where: { organizationId: user.organizationId, active: true },
    include: {
      ProgramToClient: {
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          program: true,
        },
        take: 1
      }
    },
  });
  return clients;
};

const describeClientById = async ({ clientId, authSub }) => {
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

  const now = new Date();

  await prisma.programToClient.updateMany({
    where: {
      ProgramStatus: ProgramStatus.ACTIVE,
      endDate: {
        lt: now,
      },
    },
    data: {
      ProgramStatus: ProgramStatus.COMPLETED,
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

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      active: true,
    },
    include: {
      ProgramToClient: {
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          program: true,
        },
        take: 1
      }
    },
  })

  if (!client) {
    throw new NotFoundError('client not found for your organization')
  }
  return client
}

const getAppointmentsByClientId = async ({ clientId, authSub }) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId: parseInt(clientId, 10),
      AND: [
        // Ensuring both conditions (clientId and status) are met
        {
          OR: [
            { status: 'SUCCEEDED' },
            { status: 'RECORDING' },
            { status: 'PAUSED' },
            { status: 'SCHEDULED' },
          ],
        },
      ],
    },
    include: {
      organization: true,
      user: {
        select: {
          id: true,
          fromEmailId: true
        }
      },
      template: { select: { id: true, name: true, type: true } },
    },
    orderBy: {
      date: 'asc',
    },
  })

  return appointments
}

const searchClientRecords = async ({ clientId, authSub, question }) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      clientId,
      status: 'SUCCEEDED', // Adjust based on your AppointmentStatus implementation
    },
    orderBy: {
      date: 'asc',
    },
  })

  const appointmentStrings = appointments
    .map(appointment => {
      const date = new Date(appointment.scheduleStartAt).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      const notesText = formatNotes(appointment.notes)
      return `On date ${date} with appointment id ${appointment.id}, these were the notes:\n${notesText}`
    })
    .join('\n\n---\n\n')

  const answer = await answerQuestionsAboutRecords(
    appointmentStrings,
    client,
    question
  )
  return answer
}

const updateCalorieGoalBreakdown = async ({
  clientId,
  authSub,
  calorieGoalBreakdown,
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const updatedClient = await prisma.client.update({
    where: {
      id: parseInt(clientId),
    },
    data: {
      calorieGoalBreakdown: calorieGoalBreakdown,
    },
  })

  return updatedClient
}

const updateClientsGoals = async ({ authSub, clientId, goals }) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const updatedClient = await prisma.client.update({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
    data: {
      goals: goals,
    },
  })
  return goals
}

const mergeClients = async ({ authSub, fromClientId, toClientId }) => {
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

  const fromClient = await prisma.client.findFirst({
    where: {
      id: parseInt(fromClientId),
      organizationId: user.organizationId,
    },
  })

  if (!fromClient) {
    throw new ForbiddenError('Client not found in your organization')
  }
  const toClient = await prisma.client.findFirst({
    where: {
      id: parseInt(toClientId),
      organizationId: user.organizationId,
    },
  })

  if (!toClient) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const fromClientGoals = fromClient.goals || []
  const toClientGoals = toClient.goals || []
  const mergedGoals = [...new Set([...fromClientGoals, ...toClientGoals])]

  await prisma.$transaction([
    // Mark fromClient as inactive
    prisma.client.update({
      where: { id: toClient.id },
      data: { goals: mergedGoals },
    }),
    prisma.client.update({
      where: { id: fromClient.id },
      data: { active: false },
    }),
    // Update related entities, e.g., appointments
    prisma.appointment.updateMany({
      where: { clientId: fromClient.id },
      data: { clientId: toClient.id },
    }),
  ])
}

const editClientById = async ({
  clientId,
  authSub,
  email,
  phoneNumber,
  // image,
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (phoneNumber) {
    phoneNumber = cleanUpPhoneNumber(phoneNumber)
  }

  if (client.checkInEnabled && phoneNumber != cleanUpPhoneNumber(client.phone)) {
    clientScheduleService.scheduleClientCheckIn(client.id, client.checkInTime, client.phone)
  }

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(clientId) },
    data: {
      email: email,
      phone: phoneNumber,
    },
  })

  return updatedClient
}

const uploadClientImage = async (clientId, authSub, file) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (client.imageUrl) {
    const deletedClientImage = await s3
      .deleteObject({
        Bucket: bucketName,
        Key: client.imageUrl,
      })
      .promise()
  }

  const uploadKey = `images/${clientId}/${new Date().toISOString()}-${file.name
    }`

  // Upload file to S3
  await s3
    .upload({
      Bucket: bucketName,
      Key: uploadKey,
      Body: file.data,
    })
    .promise()

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(clientId) },
    data: {
      imageUrl: uploadKey
    },
  })
  return updatedClient
}

const getImageById = async (clientId, authSub) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (!client.imageUrl || client.imageUrl.length < 5) {
    throw new NotFoundError('No image found for the user')
  }

  const url = await getPresignedUrl(bucketName, client.imageUrl)

  return {
    ...client,
    url,
  }
}

const addCheckInForClientByClientId = async (authSub, clientId, checkInTime, timeZone, checkInGoal) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (!client.phone) {
    throw new BadRequestError('Client does not have a phone number attached for check in')
  }

  if (!checkInGoal || !timeZone || !checkInTime) {
    throw new BadRequestError('Required argument [checkInGoal, timeZone, checkInTime] is missing')
  }

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(clientId) },
    data: {
      timeZone: timeZone,
      checkInTime: new Date(checkInTime),
      checkInEnabled: true,
      checkInGoal: checkInGoal
    },
  })

  clientScheduleService.scheduleClientCheckIn(
    updatedClient.id,
    updatedClient.checkInTime,
    cleanUpPhoneNumber(updatedClient.phone)
  )

  // TODO: Send a welcome message to the client
  return updatedClient
}

const getClientCheckInsById = async (clientId, authSub) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  let checkIns = await prisma.checkIns.findMany({
    where: {
      clientId: parseInt(clientId)
    }
  })

  const template = await prisma.checkInTemplate.findFirst({
    where: { clientId: client.id },
  })

  let labelToGoal = {}
  let graphs = []

  if (template && template.checkInTemplate && template.checkInTemplate.goals && template.checkInTemplate.goals.length > 0) {
    for (let goal of template.checkInTemplate.goals) {
      if (
        'label' in goal &&
        !(goal.label in labelToGoal) &&
        'expected_response_type' in goal
      ) {
        labelToGoal[goal.label] = goal
      }
    }
  }

  let labelsToGraphData = { "fat": [], "protein": [], "calories": [], "carbohydrates": [] }
  for (let checkInObject of checkIns) {
    checkInObject.day = checkInObject.day.toISOString().slice(0, 10)
    if (
      checkInObject?.checkInSummary &&
      Object.keys(checkInObject?.checkInSummary).length > 0
    ) {
      let checkInGoals = checkInObject?.checkInSummary?.answersTowardsOtherGoals
      let totalMacros = checkInObject?.checkInSummary?.totalMacros

      if (totalMacros) {
        labelsToGraphData['fat'].push({ "x": checkInObject.day, "y": totalMacros.fat })
        labelsToGraphData['protein'].push({
          x: checkInObject.day,
          y: totalMacros.protein,
        })
        labelsToGraphData['calories'].push({
          x: checkInObject.day,
          y: totalMacros.calories,
        })
        labelsToGraphData['carbohydrates'].push({
          x: checkInObject.day,
          y: totalMacros.carbohydrates,
        })
      }
      if (checkInGoals) {
        for (let checkIn of checkInGoals) {
          const label = checkIn?.label
          console.log("Label", label)
          console.log("LabelToGoal", labelToGoal)
          if (label && label in labelToGoal) {
            value_type = labelToGoal[label].expected_response_type
            if (
              value_type == 'quantitative' &&
              'quantitative_value' in checkIn
            ) {
              let labelToCheckInValues = []
              if (label in labelsToGraphData) {
                labelToCheckInValues = labelsToGraphData[label]
              }
              labelToCheckInValues.push({
                x: checkInObject.day,
                y: checkIn.quantitative_value,
              })
              labelsToGraphData[checkIn.label] = labelToCheckInValues
            }
            if (value_type == 'qualitative' && 'qualitative_value' in checkIn) {
              let labelToCheckInValues = {}
              if (label in labelsToGraphData) {
                labelToCheckInValues = labelsToGraphData[label]
              }
              const qualitativeValue = checkIn.qualitative_value
              if (!(qualitativeValue in labelToCheckInValues)) {
                labelToCheckInValues[qualitativeValue] = {
                  response: qualitativeValue,
                  count: 0,
                }
              }
              labelToCheckInValues[qualitativeValue].count += 1
              labelsToGraphData[checkIn.label] = labelToCheckInValues
            }
            if (value_type == 'categorical' && 'categorical_value' in checkIn) {
              let labelToCheckInValues = {}
              if (label in labelsToGraphData) {
                labelToCheckInValues = labelsToGraphData[label]
              }
              const categoricalValue = checkIn.categorical_value
              if (!(categoricalValue in labelToCheckInValues)) {
                labelToCheckInValues[categoricalValue] = {
                  response: categoricalValue,
                  count: 0,
                }
              }
              labelToCheckInValues[categoricalValue].count += 1
              labelsToGraphData[checkIn.label] = labelToCheckInValues
            }
          }
        }
      }
    }
  }

  for (label of Object.keys(labelsToGraphData)) {
    if (label in labelToGoal) {
      const response_type = labelToGoal[label].expected_response_type
      let graphObject = {}
      graphObject['title'] = labelToGoal[label].goal
      graphObject['label'] = label
      if (response_type == 'quantitative') {
        graphObject['graphType'] = 'line'
        graphObject['data'] = [{
          id: label,
          color: 'hsl(342, 70%, 50%)',
          data: labelsToGraphData[label],
        }]
      }
      if (response_type == 'qualitative') {
        graphObject['graphType'] = 'bar'
        graphObject['indexBy'] = 'response'
        graphObject['keys'] = ['count']
        labelsToGraphData[label] = Object.values(labelsToGraphData[label])
        graphObject['data'] = labelsToGraphData[label]
      }
      if (response_type == 'categorical') {
        graphObject['graphType'] = 'pie'
        let transformedCategoricalGraphData = []
        for (category of Object.values(labelsToGraphData[label])) {
          transformedCategoricalGraphData.push({
            id: category.response,
            label: category.response,
            value: category.count,
          })
        }
        labelsToGraphData[label] = transformedCategoricalGraphData
        graphObject['data'] = labelsToGraphData[label]
      }
      graphs.push(graphObject)
    }
  }

  graphs.push({
    title: 'Fat, Protein and Carbohydrates',
    label: 'fat_protein_carbohydrates',
    graphType: 'line',
    data: [
      {
        id: 'fat',
        color: 'hsl(339, 70%, 50%)',
        data: labelsToGraphData['fat'],
      },
      {
        id: 'protein',
        color: 'hsl(234, 70%, 50%)',
        data: labelsToGraphData['protein'],
      },
      {
        id: 'carbohydrates',
        color: 'hsl(308, 70%, 50%)',
        data: labelsToGraphData['carbohydrates'],
      },
    ],
  })
  graphs.push({
    title: 'Calories',
    label: 'calories',
    graphType: 'line',
    data: [{
      id: 'calories',
      color: 'hsl(342, 70%, 50%)',
      data: labelsToGraphData['calories'],
    }],
  })

  return { 'checkIns': checkIns, 'graphs': graphs }
}

const updateClientCheckInSetup = async (
  authSub,
  clientId,
  checkInTime,
  timeZone,
  checkInGoal
) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (client.checkInEnabled && client.checkInTime != checkInTime) {
    clientScheduleService.scheduleClientCheckIn(
      client.id,
      new Date(checkInTime),
      cleanUpPhoneNumber(client.phone)
    )
  }

  if (client.checkInGoal != checkInGoal) {
    const oldTemplate = await prisma.checkInTemplate.findFirst({
      where: { clientId: client.id }
    })
    let newTemplate
    if (oldTemplate != null) {
      newTemplate = await generateTemplateFromGoal(
        checkInGoal,
        oldTemplate.checkInTemplate
      )
      await prisma.checkInTemplate.update({
        where: { id: oldTemplate.id },
        data: {
          checkInTemplate: newTemplate,
        }
      })
    } else {
      newTemplate = await generateTemplateFromGoal(
        checkInGoal)
      const template = await prisma.checkInTemplate.create({
        data: {
          checkInTemplate: newTemplate,
          clientId: client.id,
        },
      })
    }
  }

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(client.id) },
    data: {
      timeZone: timeZone,
      checkInTime: new Date(checkInTime),
      checkInGoal: checkInGoal,
    },
  })

  return updatedClient
}

const toggleClientCheckIn = async (authSub, clientId, isEnabled) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (!isEnabled && !client.checkInEnabled) {
    throw new BadRequestError('Disabled check-in cannot be disabled')
  }

  if (isEnabled && client.checkInEnabled) {
    throw new BadRequestError('Enabled check-in cannot be enabled')
  }

  let updatedClient
  if (isEnabled) {
    clientScheduleService.scheduleClientCheckIn(client.id, client.checkInTime, cleanUpPhoneNumber(client.phone))
    updatedClient = await prisma.client.update({
      where: { id: parseInt(client.id) },
      data: {
        checkInEnabled: true,
      },
    })
  } else {
    clientScheduleService.removeClientCheckIn(client.id)
    updatedClient = await prisma.client.update({
      where: { id: parseInt(client.id) },
      data: {
        checkInEnabled: false,
      },
    })
  }
  return updatedClient
}

const getMessagesByClientId = async (authSub, clientId) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const messages = await prisma.messages.findMany({
    where: {
      clientId: parseInt(clientId)
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(clientId) },
    data: {
      lastMessageViewedDate: new Date(),
    },
  })

  return {
    messages: messages,
    id: clientId,
    name: client.name,
    email: client.email,
    phone: client.phone,
  }
}

const sendMessageToClient = async (authSub, clientId, message) => {
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

  const client = await prisma.client.findFirst({
    where: {
      id: parseInt(clientId),
      organizationId: user.organizationId,
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  if (!client.phone) {
    throw new BadRequestError("Client does not have phone number.")
  }


  await sendSms(cleanUpPhoneNumber(client.phone), message)
  const createdMessage = await prisma.messages.create({
    data: {
      clientId: client.id,
      message: message,
      userId: user.id,
      messageOwner: MessageOwner.ASSISTANT,
      messageType: MessageType.TEXT
    }
  })

  const messages = await prisma.messages.findMany({
    where: {
      clientId: parseInt(clientId),
    },
    orderBy: {
      createdAt: 'asc',
    },
  })

  await delay(1000)

  const updatedClient = await prisma.client.update({
    where: { id: parseInt(clientId) },
    data: {
      lastMessageViewedDate: new Date(),
    },
  })

  return { messages: messages, id: clientId, name: client.name, email: client.email, phone: client.phone }
}

const getClientsWithLatestMessage = async (authSub) => {
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

  const clientsWithMessagesInfo = await prisma.client.findMany({
    where: {
      organizationId: user.organizationId,
      active: true,
      messages: {
        some: {}, // Ensures at least one message exists
      },
    },
    include: {
      messages: {
        orderBy: {
          createdAt: 'desc',
        },
        take: 1,
      },
    },
  })

  const clientData = await Promise.all(
    clientsWithMessagesInfo.map(async client => {
      const unreadCount = await prisma.messages.count({
        where: {
          clientId: client.id,
          createdAt: {
            gt: client.lastMessageViewedDate || new Date(0),
          },
        },
      })

      return {
        ...client,
        unreadMessageCount: unreadCount,
        latestMessageDate: client.messages[0]?.createdAt || new Date(0),
      }
    })
  )

  // Sort the clients based on the latest message date
  clientData.sort((a, b) => b.latestMessageDate - a.latestMessageDate)

  return clientData
}

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time))
}

const addClientToProgram = async ({
  programId,
  clientId,
  startDate,
  authSub,
}) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
    include: { organization: true },
  });

  if (!user) {
    throw new NotFoundError('User not found for the given auth ID');
  }

  if (!user.organization) {
    throw new NotFoundError('Organization not found');
  }

  const client = await prisma.client.findFirst({
    where: { id: clientId, active: true },
  });

  if (!client) {
    throw new NotFoundError('client not found for your organization');
  }

  const program = await prisma.program.findFirst({
    where: { id: programId, active: true },
  });

  if (!program) {
    throw new NotFoundError('program not found for your organization');
  }
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + program.duration);
  const isoEndDate = endDate.toISOString();
  const cancelDate = new Date().toISOString();

  await prisma.programToClient.updateMany({
    where: {
      ProgramStatus: {
        in: [ProgramStatus.ACTIVE, ProgramStatus.SCHEDULED, ProgramStatus.PAUSED],
      },
      clientId: clientId,
    },
    data: {
      ProgramStatus: ProgramStatus.CANCELLED,
      cancelDate: cancelDate,
    },
  });

  let programStatusVariable = null;

  if (startDate.toISOString().split('T')[0] < new Date().toISOString().split('T')[0]) {
    throw new BadRequestError('Start date should be greater than today');
  } else if (startDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]) {
    programStatusVariable = ProgramStatus.ACTIVE;
  } else {
    programStatusVariable = ProgramStatus.SCHEDULED;
  }

  programId = parseInt(programId);
  const ProgramToClient = await prisma.programToClient.create({
    data: {
      programId,
      clientId,
      ProgramStatus: programStatusVariable,
      startDate,
      endDate: isoEndDate,
    },
  });
  return ProgramToClient;
};

const checkEnrollment = async ({ programId, authSub }) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found for the given auth ID');
  }

  const program = await prisma.program.findUnique({
    where: { id: programId, active: true },
  });

  if (!program) {
    throw new NotFoundError('program not found for your organization');
  }

  const enrollment = await prisma.programToClient.findMany({
    where: {
      programId: programId,
    },
    select: {
      startDate: true,
      endDate: true,
      pauseDates: true,
      ProgramStatus: true,
      client: {
        select: {
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  });
  return enrollment;
};

const pauseProgramToClient = async ({
  clientProgramId,
  clientId,
  authSub,
}) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  });

  if (!user) {
    throw new NotFoundError('User not found for the given auth ID');
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId, active: true },
  });

  if (!client) {
    throw new NotFoundError('client not found for your organization');
  }

  const programToClient = await prisma.programToClient.findUnique({
    where: { id: clientProgramId, },
  });

  if (!programToClient) {
    throw new NotFoundError('No program client relationship found for this programToClientId');
  } else if (programToClient.clientId != clientId) {
    throw new NotFoundError('This program is not enrolled to this client');
  } else if (
    programToClient.ProgramStatus === ProgramStatus.CANCELLED ||
    programToClient.ProgramStatus === ProgramStatus.COMPLETED ||
    programToClient.ProgramStatus === ProgramStatus.SCHEDULED
  ) {
    throw new NotFoundError('program is already cancelled, completed, or scheduled');
  } else if (programToClient.ProgramStatus === ProgramStatus.ACTIVE) {
    const pauseDate = new Date().toISOString();

    const currentProgramToClient = await prisma.programToClient.findUnique({
      where: {
        id: clientProgramId,
      },
      select: {
        pauseDates: true,
      },
    });

    const existingPauseDates = currentProgramToClient?.pauseDates || [];

    const updatedPauseDates = [...existingPauseDates, pauseDate];

    let updateprogramToClient = null;
    try {
      updateprogramToClient = await prisma.programToClient.update({
        where: {
          id: clientProgramId,
          clientId: clientId,
        },
        data: {
          ProgramStatus: ProgramStatus.PAUSED,
          pauseDates: updatedPauseDates,
        },
      });
    } catch (e) {
      throw new NotFoundError('This program is not enrolled to this client')
    }

    return updateprogramToClient;
  } else {
    const pausedatearray = await prisma.programToClient.findUnique({
      where: {
        id: clientProgramId,
      },
      select: {
        pauseDates: true,
      },
    });

    // Get the last pause date from the array
    const lastPauseDate = pausedatearray?.pauseDates?.[pausedatearray.pauseDates.length - 1];

    if (!lastPauseDate) {
      throw new Error('No pause date found');
    }

    const pauseDate = new Date(lastPauseDate);
    if (isNaN(pauseDate)) {
      throw new Error('Invalid pause date');
    }

    const pauseDays = Math.floor((new Date() - pauseDate) / (1000 * 60 * 60 * 24));
    const newEndDate = new Date(new Date(programToClient.endDate).getTime() + pauseDays * 24 * 60 * 60 * 1000);

    if (isNaN(newEndDate)) {
      throw new Error('Invalid new end date');
    }

    let updateprogramToClient = null;
    try {
      updateprogramToClient = await prisma.programToClient.update({
        where: {
          id: clientProgramId,
          clientId: clientId,
        },
        data: {
          ProgramStatus: ProgramStatus.ACTIVE,
          endDate: newEndDate.toISOString(),
        },
      });
    } catch (e) {
      throw new NotFoundError('This program is not enrolled to this client')
    }
    return updateprogramToClient;
  }
};

const cancelProgramToClient = async ({
  clientProgramId,
  clientId,
  authSub,
}) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  });

  if (!user) {
    throw new NotFoundError('User not found for the given auth ID');
  }

  const programToClient = await prisma.programToClient.findUnique({
    where: { id: clientProgramId },
  });

  if (!programToClient) {
    throw new NotFoundError('No program client relationship found for this programToClientId');
  } else if (programToClient.clientId != clientId) {
    throw new NotFoundError('This program is not enrolled to this client');
  } else if (programToClient.ProgramStatus === ProgramStatus.CANCELLED || programToClient.ProgramStatus === ProgramStatus.COMPLETED) {
    throw new NotFoundError('program is already cancelled or completed');
  } else {
    const cancelDate = new Date().toISOString();
    let cancelProgramToClient = null
    try {
      cancelProgramToClient = await prisma.programToClient.update({
        where: {
          id: clientProgramId,
          clientId: clientId,
        },
        data: {
          ProgramStatus: ProgramStatus.CANCELLED,
          cancelDate: cancelDate,
        },
      })
    } catch (e) {
      throw new NotFoundError('This program is not enrolled to this client')
    }
    return cancelProgramToClient;
  }
}

const questionClient = async ({ appointmentId, authSub }) => {
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

  const talkingPoints = await appointmentTalkingPoints({
    appointmentId
  })

  const metaData = {
    appointmentId: appointmentId,
  }

  const createTrack = await prisma.trackTalkingPointsUse.create({
    data: {
      appointmentId: appointmentId,
      userId: user.id,
      metaData: metaData,
      purpose: 'talking points',
    }
  })

  console.log(createTrack)

  return talkingPoints;
}

module.exports = {
  createClient,
  getClients,
  describeClientById,
  getAppointmentsByClientId,
  searchClientRecords,
  updateCalorieGoalBreakdown,
  updateClientsGoals,
  mergeClients,
  editClientById,
  uploadClientImage,
  getImageById,
  addCheckInForClientByClientId,
  getClientCheckInsById,
  updateClientCheckInSetup,
  toggleClientCheckIn,
  getMessagesByClientId,
  sendMessageToClient,
  getClientsWithLatestMessage,
  addClientToProgram,
  checkEnrollment,
  pauseProgramToClient,
  cancelProgramToClient,
  questionClient,
}

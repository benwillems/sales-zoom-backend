const {
  createClient,
  getClients,
  getAppointmentsByClientId,
  searchClientRecords,
  describeClientById,
  updateClientsGoals,
  mergeClients,
  editClientById,
  updateCalorieGoalBreakdown,
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
} = require('../services/clientService')
const { HttpError } = require('../errors/HttpError')

exports.createClient = async (req, res) => {
  const { name, phone, email } = req.body
  const authSub = req.auth?.sub

  try {
    const client = await createClient({ name, phone, email, authSub })
    return res.status(200).json(client)
  } catch (error) {
    console.error('Error creating client:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getClients = async (req, res) => {
  const authSub = req.auth?.sub
  try {
    const clients = await getClients(authSub)
    return res.status(200).json(clients)
  } catch (error) {
    console.error('Error fetching clients:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.describeClientById = async (req, res) => {
  const clientId = parseInt(req.params.clientId)
  const authSub = req.auth?.sub

  try {
    const pet = await describeClientById({ clientId, authSub })
    return res.status(200).json(pet)
  } catch (error) {
    console.error('Error fetching client details:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send(error.message)
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getAppointmentsByClientId = async (req, res) => {
  const clientId = parseInt(req.params.clientId)
  const authSub = req.auth?.sub

  try {
    const appointments = await getAppointmentsByClientId({ clientId, authSub })
    return res.status(200).json(appointments)
  } catch (error) {
    console.error('Error fetching appointments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.searchClientRecords = async (req, res) => {
  const authSub = req.auth?.sub
  const { clientId, question } = req.body
  try {
    const answer = await searchClientRecords({ clientId, authSub, question })
    return res.status(200).send({ answer })
  } catch (error) {
    console.error('Error during search:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.updateCalorieGoalBreakdown = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.body.clientId
  const calorieGoalBreakdown = {
    calories: req.body.calories,
    fat: req.body.fat,
    carbohydrates: req.body.carbohydrates,
    protein: req.body.protein,
  }

  try {
    const updatedClient = await updateCalorieGoalBreakdown({
      clientId,
      authSub,
      calorieGoalBreakdown,
    })
    return res.status(200).json(updatedClient)
  } catch (error) {
    console.error('Error editing client calorie goal breakdown:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.updateClientsGoals = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    const { clientId, goals } = req.body
    await updateClientsGoals({ authSub, clientId, goals })

    res.status(200).json({
      message: 'Updated clients goals',
      updatedClientGoals: { goals: goals },
    })
  } catch (error) {
    console.error('Error updating notes template:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.mergeClients = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    const { fromClientId, toClientId } = req.body
    await mergeClients({ authSub, fromClientId, toClientId })

    res.status(200).json({
      message: 'Clients merged',
    })
  } catch (error) {
    console.error('Error merging clients:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.editClientById = async (req, res) => {
  const authSub = req.auth?.sub
  const { email, phoneNumber, clientId } = req.body

  try {
    const updatedClient = await editClientById({
      clientId,
      authSub,
      email,
      phoneNumber,
    })
    return res.status(200).json(updatedClient)
  } catch (error) {
    console.error('Error editing client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.uploadClientImage = async (req, res) => {
  if (!req.files || Object.keys(req.files).length === 0) {
    return res.status(400).send('No files were uploaded.')
  }

  const authSub = req.auth?.sub
  const { clientId } = req.body

  try {
    const updatedClient = await uploadClientImage(
      clientId,
      authSub,
      req.files.file
    )
    return res.status(200).json(updatedClient)
  } catch (error) {
    console.error('Error editing client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getClientImageById = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.params.clientId

  try {
    const updatedClient = await getImageById(
      clientId,
      authSub
    )
    return res.status(200).json(updatedClient)
  } catch (error) {
    console.error('Error editing client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.addCheckInForClient = async (req, res) => {
  const authSub = req.auth?.sub
  const { clientId, checkInTime, timeZone, checkInGoal } = req.body

  try {
    const client = await addCheckInForClientByClientId(authSub, clientId, checkInTime, timeZone, checkInGoal)
    return res.status(200).json(client)
  } catch (error) {
    console.error('Error adding checkin to client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getClientCheckInsById = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.params.clientId

  try {
    const checkInsForClient = await getClientCheckInsById(clientId, authSub)
    return res
      .status(200)
      .json(
        checkInsForClient
      )
  } catch (error) {
    console.error('Error finding checkins for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.updateClientCheckInSetup = async (req, res) => {
  const authSub = req.auth?.sub
  const { checkInTime, timeZone, checkInGoal } = req.body
  const clientId = req.params.clientId

  try {
    const client = await updateClientCheckInSetup(
      authSub,
      clientId,
      checkInTime,
      timeZone,
      checkInGoal
    )
    return res.status(200).json(client)
  } catch (error) {
    console.error('Error updating checkin details of client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.toggleClientCheckIn = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.params.clientId

  const { isEnabled } = req.body

  try {
    const client = await toggleClientCheckIn(authSub, clientId, isEnabled)
    return res.status(200).json(client)
  } catch (error) {
    console.error('Error toggling check in of client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getMessagesByClientId = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.params.clientId

  try {
    const messagesForClient = await getMessagesByClientId(authSub, clientId)
    return res.status(200).json(messagesForClient)
  } catch (error) {
    console.error('Error getting messages for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.sendMessageToClient = async (req, res) => {
  const authSub = req.auth?.sub
  const clientId = req.body.clientId
  const message = req.body.message

  try {
    const messagesForClient = await sendMessageToClient(authSub, clientId, message)
    return res.status(200).json(messagesForClient)
  } catch (error) {
    console.error('Error getting messages for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getClientsWithLatestMessage = async (req, res) => {
  const authSub = req.auth?.sub

  try {
    const firstMessageForClients = await getClientsWithLatestMessage(authSub)
    return res.status(200).json(firstMessageForClients)
  } catch (error) {
    console.error('Error getting first message for client:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}


exports.addClientToProgram = async (req, res) => {
  const { programId, clientId, startDate } = req.body;
  const authSub = req.auth?.sub;

  try {
    const ProgramToClient = await addClientToProgram({
      programId: parseInt(programId),
      clientId: parseInt(clientId),
      startDate: new Date(startDate),
      authSub: authSub
    });
    return res.status(200).json(ProgramToClient);
  } catch (error) {
    console.error('Error creating program:', error.message);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

exports.checkEnrollment = async (req, res) => {
  const authSub = req.auth?.sub;
  const programId = req.params.programId;

  try {
    const enrolled = await checkEnrollment({
      programId: parseInt(programId),
      authSub: authSub,
    });
    return res.status(200).json(enrolled);
  } catch (error) {
    console.error('Error checking enrollment:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}

exports.pauseProgramToClient = async (req, res) => {
  const { clientId } = req.body;
  const authSub = req.auth?.sub;
  const clientProgramId = req.params.clientProgramId;

  try {
    const pausedProgramToClient = await pauseProgramToClient({
      clientProgramId: parseInt(clientProgramId),
      clientId: parseInt(clientId),
      authSub: authSub
    });
    return res.status(200).json(pausedProgramToClient);
  } catch (error) {
    console.error('Error pausing program to client:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}

exports.cancelProgramToClient = async (req, res) => {
  const { clientId } = req.body;
  const authSub = req.auth?.sub;
  const clientProgramId = req.params.clientProgramId;

  try {
    const canceledProgramToClient = await cancelProgramToClient({
      clientProgramId: parseInt(clientProgramId),
      clientId: parseInt(clientId),
      authSub: authSub
    });
    return res.status(200).json(canceledProgramToClient);
  } catch (error) {
    console.error('Error canceling program to client:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}

exports.questionClient = async (req, res) => {
  const appointmentId = parseInt(req.params.appointmentId)
  const authSub = req.auth?.sub

  try {
    const pet = await questionClient({ appointmentId, authSub })
    return res.status(200).json(pet)
  } catch (error) {
    console.error('Error fetching client details:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send(error.message)
    }
    return res.status(500).json({ error: error.message })
  }
}

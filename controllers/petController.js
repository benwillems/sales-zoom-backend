const {
  createPet,
  getPetsByClientId,
  describePetById,
  getAppointmentsByPetId,
  getPetsWithClients,
  searchPetRecords,
  editPetById,
} = require('../services/petService')

const { HttpError } = require('../errors/HttpError')

exports.createPet = async (req, res) => {
  const clientId = parseInt(req.params.clientId)
  const { name, species, breed, age, gender, description } = req.body
  const authSub = req.auth?.sub

  try {
    const pet = await createPet({
      clientId,
      name,
      species,
      breed,
      age,
      gender,
      description,
      authSub,
    })
    return res.status(200).json(pet)
  } catch (error) {
    console.error('Error creating pet:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    } else {
      return res.status(500).json({ error: error.message })
    }
  }
}

exports.getPetsByClientId = async (req, res) => {
  const clientId = parseInt(req.params.clientId)
  const authSub = req.auth?.sub
  try {
    const pets = await getPetsByClientId({ clientId, authSub })
    res.status(200).json(pets)
  } catch (error) {
    console.error('Error fetching pets:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.describePetById = async (req, res) => {
  const petId = parseInt(req.params.petId)
  const authSub = req.auth?.sub

  try {
    const pet = await describePetById({ petId, authSub })
    return res.status(200).json(pet)
  } catch (error) {
    console.error('Error fetching pet details:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).send(error.message)
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getAppointmentsByPetId = async (req, res) => {
  const petId = parseInt(req.params.petId)
  const authSub = req.auth?.sub

  try {
    const appointments = await getAppointmentsByPetId({ petId, authSub })
    return res.status(200).json(appointments)
  } catch (error) {
    console.error('Error fetching appointments:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.editPetById = async (req, res) => {
  const petId = parseInt(req.params.petId)
  const authSub = req.auth?.sub
  const { age, breed, species } = req.body

  try {
    const updatedPet = await editPetById({
      petId,
      authSub,
      age,
      breed,
      species,
    })
    return res.status(200).json(updatedPet)
  } catch (error) {
    console.error('Error editing pet:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.searchPetRecords = async (req, res) => {
  const authSub = req.auth?.sub
  const { petId, question } = req.body
  try {
    const answer = await searchPetRecords({ petId, authSub, question })
    return res.status(200).send({ answer })
  } catch (error) {
    console.error('Error during search:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: error.message })
  }
}

exports.getPetsWithClients = async (req, res) => {
  const authSub = req.auth?.sub

  try {
    const petsWithClients = await getPetsWithClients(authSub)
    return res.status(200).json({ records: petsWithClients })
  } catch (error) {
    console.error('Error fetching pets with clients:', error)
    return res.status(500).json({ error: error.message })
  }
}

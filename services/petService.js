const { NotFoundError, ForbiddenError } = require('../errors/HttpError')
const { PrismaClient } = require('@prisma/client')
const {
  answerQuestionsAboutRecords,
  formatNotes,
} = require('../utils/searchutils')
const prisma = new PrismaClient()

const createPet = async ({
  clientId,
  name,
  species,
  breed,
  age,
  gender,
  description,
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

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      organization: {
        id: user.organizationId,
      },
    },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  const pet = await prisma.pet.create({
    data: {
      name,
      species,
      breed,
      age: age,
      gender: gender,
      description: description,
      clientId,
    },
  })

  return pet
}

const getPetsByClientId = async ({ clientId, authSub }) => {
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
      organization: {
        id: user.organizationId,
      },
    },
    include: { pets: true },
  })

  if (!client) {
    throw new ForbiddenError('Client not found in your organization')
  }

  return client.pets
}

const describePetById = async ({ petId, authSub }) => {
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

  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      client: {
        organizationId: user.organizationId,
      },
    },
    include: {
      client: true,
    },
  })

  if (!pet) {
    throw new NotFoundError('Pet not found for your organization')
  }

  return pet
}

const getAppointmentsByPetId = async ({ petId, authSub }) => {
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

  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      client: {
        organizationId: user.organizationId,
      },
    },
  })

  if (!pet) {
    throw new ForbiddenError('Pet not found in your organization')
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      petId: parseInt(petId, 10),
      AND: [
        // Ensuring both conditions (petId and status) are met
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
    },
    orderBy: {
      date: 'asc',
    },
  })

  return appointments
}

const editPetById = async ({ petId, authSub, age, breed, species }) => {
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

  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      client: {
        organizationId: user.organizationId,
      },
    },
  })

  if (!pet) {
    throw new NotFoundError('Pet not found')
  }

  const updatedPet = await prisma.pet.update({
    where: {
      id: petId,
    },
    data: {
      age: age,
      breed: breed,
      species: species,
    },
    include: {
      client: true,
    },
  })

  return updatedPet
}

const searchPetRecords = async ({ petId, authSub, question }) => {
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

  const pet = await prisma.pet.findFirst({
    where: {
      id: petId,
      client: {
        organizationId: user.organizationId,
      },
    },
  })

  if (!pet) {
    throw new ForbiddenError('Pet not found in your organization')
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      petId,
      status: 'SUCCEEDED', // Adjust based on your AppointmentStatus implementation
    },
    orderBy: {
      date: 'asc',
    },
  })

  const appointmentStrings = appointments
    .map(appointment => {
      const date = new Date(appointment.date).toLocaleString('en-US', {
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
    pet,
    question
  )
  return answer
}

async function getPetsWithClients(authSub) {
  const user = await prisma.user.findFirst({
    where: {
      uniqueAuthId: authSub,
    },
  })
  if (!user) {
    throw new NotFoundError('User not found')
  }

  const petsWithClients = await prisma.pet.findMany({
    where: {
      client: {
        organization: {
          id: user.organizationId,
        },
      },
    },
    include: {
      client: true,
    },
    orderBy: {
      name: 'asc',
    },
  })

  return petsWithClients
}
module.exports = {
  createPet,
  getPetsByClientId,
  describePetById,
  getAppointmentsByPetId,
  editPetById,
  searchPetRecords,
  getPetsWithClients,
}

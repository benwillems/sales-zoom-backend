const express = require('express')
const router = express.Router()
const petController = require('../controllers/petController')

router.post('/clients/:clientId/pets', petController.createPet)

router.get('/clients/:clientId/pets', petController.getPetsByClientId)

router.get('/pets/:petId', petController.describePetById)

router.get('/pets/:petId/appointments', petController.getAppointmentsByPetId)

router.put('/pet/:petId', petController.editPetById)

router.get('/pets-with-clients', petController.getPetsWithClients)

router.post('/search/pet', petController.searchPetRecords)

module.exports = router

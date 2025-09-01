const express = require('express')
const router = express.Router()
const organizationController = require('../controllers/organizationController')

router.get('/organization', organizationController.getOrganization)

router.post('/organization', organizationController.createOrganization)

router.post('/update-organization', organizationController.updateOrganization)

router.post(
  '/update-notes-template',
  organizationController.updateNotesTemplate
)

router.post('/reset-notes-template', organizationController.resetNotesTemplate)

router.post('/update-user', organizationController.updateUser)

router.post('/invite/user', organizationController.inviteUser)

router.get('/organization/users', organizationController.getUsersForOrganization)

router.get(
  '/roles',
  organizationController.getRoles
)

router.get('/user/templates', organizationController.getTemplatesByUser)
router.get('/organization/templates', organizationController.getTemplatesByOrganization)
router.get('/template/:templateId', organizationController.getTemplateByTemplateId)
router.post('/template/default', organizationController.setTemplateDefault)

router.get('/organization/program', organizationController.getProgram); // it must be organisation

router.post('/organization/program', organizationController.createProgram);

router.post('/organization/updateprogram/:programId', organizationController.updateProgram);

router.post('/organization/deleteprogram/:programId', organizationController.deleteProgram);
module.exports = router

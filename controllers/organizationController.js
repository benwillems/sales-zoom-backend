const {
  createOrganizationAndUser,
  findOrganizationByAuthSub,
  updateOrganization,
  updateUser,
  updateNotesTemplate,
  resetNotesTemplate,
  inviteUser,
  getUsersForOrganization,
  getRoles,
  getTemplatesByUser,
  getTemplatesByOrganization,
  getTemplateByTemplateId,
  setTemplateDefault,
  getPrograms,
  createProgram,
  updatePrograms,
  deletePrograms,
} = require('../services/organizationService')
const { HttpError } = require('../errors/HttpError')
const { parseDate } = require('pdf-lib')
const { parseBoolean } = require('../utils/audioAppointmentUtils')

exports.getOrganization = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    const email = req.auth?.email
    const organization = await findOrganizationByAuthSub(authSub, email)
    if (!organization) {
      return res.status(403).json({ error: 'Organization does not exist' })
    }
    return res.status(200).json(organization)
  } catch (error) {
    console.error('Failed to fetch organization:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.createOrganization = async (req, res) => {
  try {
    const { orgName, orgAddress, orgPhone, orgEmail, userName, userPhone} = req.body
    const authSub = req.auth?.sub
    const userEmail = req.auth?.email
    const organization = await createOrganizationAndUser({
      orgName,
      orgAddress,
      orgPhone,
      orgEmail,
      userName,
      userPhone,
      userEmail,
      authSub: authSub,
    })
    res.status(200).json(organization)
  } catch (error) {
    console.error('Error creating organization:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.updateOrganization = async (req, res) => {
  try {
    const { name, address, phone, email } = req.body
    const authSub = req.auth?.sub

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (address !== undefined) updateData.address = address
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email

    const updatedOrganization = await updateOrganization(authSub, updateData)

    res
      .status(200)
      .json({
        message: 'Organization updated',
        organization: updatedOrganization,
      })
  } catch (error) {
    console.error('Error updating organization:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.updateNotesTemplate = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    const { templateId, updatedNotesTemplate } = req.body
    await updateNotesTemplate(authSub, templateId, updatedNotesTemplate)

    res.status(200).json({ message: 'Updated note template', updatedNotesTemplate: { notes: updatedNotesTemplate } })
  } catch (error) {
    console.error('Error updating notes template:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.resetNotesTemplate = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    const templateId = req.body.templateId
    const notes = await resetNotesTemplate(authSub, templateId)

    res.status(200).json({ message: 'Updated note template to default', notes })
  } catch (error) {
    console.error('Error resetting notes template:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.updateUser = async (req, res) => {
  try {
    const { name, phone, email } = req.body
    const authSub = req.auth?.sub

    const updateData = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone
    if (email !== undefined) updateData.email = email

    const updatedUser = await updateUser(authSub, updateData)

    res.status(200).json({
      message: 'User updated',
      user: updatedUser,
    })
  } catch (error) {
    console.error('Error updating user:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.inviteUser = async (req, res) => {
  try {
    const { name, email, roleId } = req.body
    const authSub = req.auth?.sub

    const invitedUser = await inviteUser(name, email, roleId, authSub)

    res.status(200).json({
      message: 'User invited',
    })
  } catch (error) {
    console.error('Error inviting user:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getUsersForOrganization = async (req, res) => {
  try {
    const authSub = req.auth?.sub

    const users = await getUsersForOrganization(authSub)

    res.status(200).json({
      users: users,
    })
  } catch (error) {
    console.error('Error fetching user:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getRoles = async (req, res) => {
  try {
    const authSub = req.auth?.sub

    const roles = await getRoles(authSub)

    res.status(200).json({
      roles: roles,
    })
  } catch (error) {
    console.error('Error fetching roles:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getTemplatesByUser = async (req, res) => {
  try {
    const authSub = req.auth?.sub

    const templates = await getTemplatesByUser(authSub)

    res.status(200).json({
      templates: templates,
    })
  } catch (error) {
    console.error('Error fetching templates:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getTemplatesByOrganization = async (req, res) => {
  try {
    const authSub = req.auth?.sub

    const templates = await getTemplatesByOrganization(authSub)

    res.status(200).json({
      templates: templates,
    })
  } catch (error) {
    console.error('Error fetching templates:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getTemplateByTemplateId = async (req, res) => {
  try {
    const authSub = req.auth?.sub
    
    const templateId = parseInt(req.params.templateId)
    const template = await getTemplateByTemplateId(authSub, templateId)

    res.status(200).json({
      notesTemplate: {
        notes: template,
      }
    })
  } catch (error) {
    console.error('Error fetching template:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.setTemplateDefault = async (req, res) => {
  try {
    const authSub = req.auth?.sub

    const { templateId } = req.body
    const template = await setTemplateDefault(authSub, parseInt(templateId))

    res.status(200).json({
      template: template,
    })
  } catch (error) {
    console.error('Error setting template:', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.createProgram = async (req, res) => {
  const { name, duration, price, description } = req.body;
  const authSub = req.auth?.sub;

  try {
    const program = await createProgram({
      name: name,
      duration: parseInt(duration),
      price: parseInt(price),
      description: description,
      authSub: authSub,
    });
    return res.status(200).json(program);
  } catch (error) {
    console.error('Error creating program:', error.message);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

exports.getProgram = async (req, res) => {
  const authSub = req.auth?.sub;
  try {
    const programs = await getPrograms(authSub);
    return res.status(200).json(programs);
  } catch (error) {
    console.error('Error fetching programs:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
};

exports.updateProgram = async (req, res) => {
  const { price, description } = req.body;
  const programId = req.params.programId;
  const authSub = req.auth?.sub;

  try {
    const updatedProgram = await updatePrograms({
      price: parseInt(price),
      description: description,
      programId: parseInt(programId),
      authSub: authSub,
    });
    return res.status(200).json(updatedProgram);
  } catch (error) {
    console.error('Error fetching programs:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}

exports.deleteProgram = async (req, res) => {
  const { programName } = req.body;
  const programId = req.params.programId;
  const authSub = req.auth?.sub;

  try {
    const updatedProgram = await deletePrograms({
      programName: programName,
      programId: parseInt(programId),
      authSub: authSub,
    });
    return res.status(200).json(updatedProgram);
  } catch (error) {
    console.error('Error fetching programs:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: error.message });
  }
}

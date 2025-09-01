const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()
const {
  templateToSimplifiedNotes,
  defaultNotesTemplate,
  simplifiedNotesToTemplate,
} = require('../utils/notesTemplateProcessor') // Ensure simplifiedNotesToTemplate is correctly imported
const { NotFoundError, BadRequestError } = require('../errors/HttpError') // Adjust the path as necessary

const findOrganizationByAuthSub = async (authSub, email) => {
  let user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      notesTemplate: true,
      organization: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
          email: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  })

  if (!user) {
    user = await prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        notesTemplate: true,
        organization: {
          select: {
            id: true,
            name: true,
            address: true,
            phone: true,
            email: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })
    if (!user) {
      throw new NotFoundError('User not found for the given Auth ID')
    }
    user = await prisma.user.update({
      where: { email: email },
      data: { uniqueAuthId: authSub },
    })
  }

  if (
    user.notesTemplate &&
    Object.keys(user.notesTemplate).length > 0
  ) {
    user.notesTemplate = {
      notes: templateToSimplifiedNotes(user.notesTemplate),
    }
  } else {
    user.notesTemplate = {
      notes: templateToSimplifiedNotes(defaultNotesTemplate),
    }
  }

  return user
}

const createOrganizationAndUser = async ({
  orgName,
  orgAddress,
  orgPhone,
  orgEmail,
  userName,
  userPhone,
  userEmail,
  authSub,
}) => {
  const organization = await prisma.organization.create({
    data: {
      name: orgName,
      address: orgAddress,
      phone: orgPhone,
      email: orgEmail,
    },
  })
  const user = await prisma.user.create({
    data: {
      name: userName,
      phone: userPhone,
      email: userEmail,
      uniqueAuthId: authSub,
      organizationId: organization.id,
      roleId: 1,
    },
  })

  const defaultTemplates = await prisma.defaultTemplate.findMany()

  // Create templates for the user based on the default templates
  for (const defaultTemplate of defaultTemplates) {
    await prisma.template.create({
      data: {
        name: defaultTemplate.name,
        notesTemplate: defaultTemplate.notesTemplate,
        type: defaultTemplate.type,
        organizationId: organization.id,
        userId: user.id,
        defaultTemplateId: defaultTemplate.id,
      },
    })
  }

  return {
    organization,
    user,
  }
}

const inviteUser = async (name, email, roleId, authSub) => {
  const adminUser = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!adminUser) {
    throw new NotFoundError('User not found')
  }

  const user = await prisma.user.create({
    data: {
      name: name,
      email: email,
      uniqueAuthId: `NOT_ONBOARDED_${Date.now().toString()}`,
      notesTemplate: defaultNotesTemplate,
      organizationId: adminUser.organizationId,
      roleId: roleId,
    },
  })
  return user
}

const updateOrganization = async (authSub, updateData) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
    include: { organization: true },
  })

  if (!user.organization) {
    throw new NotFoundError('Organization not found')
  }

  const updatedOrganization = await prisma.organization.update({
    where: { id: user.organizationId },
    data: updateData,
  })

  return updatedOrganization
}

const updateUser = async (authSub, updateData) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const updatedUser = await prisma.user.update({
    where: { uniqueAuthId: authSub },
    data: updateData,
  })

  return updatedUser
}

const updateNotesTemplate = async (authSub, templateId, updatedNotesTemplate) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const template = await prisma.template.findUnique({
    where: {
      id: parseInt(templateId),
      userId: user.id
    },
  })
  if (!template) {
    return BadRequestError("Template not found")
  }
  const detailedNotesTemplate = simplifiedNotesToTemplate(
    template.notesTemplate,
    updatedNotesTemplate
  )
  const updatedTemplate = await prisma.template.update({
    where: { id: templateId },
    data: { notesTemplate: detailedNotesTemplate },
  })

  return updatedTemplate
}

const resetNotesTemplate = async (authSub, templateId) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const template = await prisma.template.findUnique({
    where: {id: templateId, userId: user.id },
    include: {
      defaultTemplate: true
    }
  })


  if (!template) {
    throw new NotFoundError('Template not found')
  }

  const defaultTemplate = await prisma.defaultTemplate.findUnique({
    where: { id: template.defaultTemplateId },
  })
  const updatedTemplate = await prisma.template.update({
    where: { id: templateId, userId: user.id },
    data: { notesTemplate: defaultTemplate.notesTemplate }
  })
  return templateToSimplifiedNotes(updatedTemplate.notesTemplate)
}

const getUsersForOrganization = async authSub => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const users = await prisma.user.findMany({
    where: { organizationId: user.organizationId }
  })

  return users
}

const getRoles = async authSub => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const roles = await prisma.role.findMany()
  return roles
}

const getTemplatesByUser = async authSub => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const templates = await prisma.template.findMany({
    where: {userId: user.id}
  })
  return templates
}

const getTemplatesByOrganization = async authSub => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const templates = await prisma.template.findMany({
    where: { organizationId: user.organizationId },
  })
  return templates
}

const getTemplateByTemplateId = async (authSub, templateId) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const template = await prisma.template.findFirst({
    where: {
      id: templateId,
      userId: user.id,
    },
  })
  if (!template) throw new NotFoundError('Template not found')

  return templateToSimplifiedNotes(template.notesTemplate)
}

const setTemplateDefault = async (authSub, templateId) => {
  const user = await prisma.user.findUnique({
    where: { uniqueAuthId: authSub },
  })

  if (!user) {
    throw new NotFoundError('User not found')
  }

  const result = await prisma.$transaction(async prisma => {
    // Set all templates of the user to not default
    await prisma.template.updateMany({
      where: {
        userId: user.id,
        default: true,
      },
      data: {
        default: false,
      },
    })

    // Set the specified template as the default
    const updatedTemplate = await prisma.template.update({
      where: {
        id: templateId,
        userId: user.id, // Ensure the template belongs to the user
      },
      data: {
        default: true,
      },
    })
    return updatedTemplate
  })
}

const getPrograms = async (authSub) => {
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

  const programs = await prisma.program.findMany({
      where: { organizationId: user.organizationId, active: true },
  });

  return programs;
};

const createProgram = async ({
  name,
  duration,
  price,
  description,
  authSub,
}) => {
  const user = await prisma.user.findUnique({
      where: { uniqueAuthId: authSub },
      include: { organization: true },
  });

  //  also verify client , orgamisation, program
  if (!user) {
      throw new NotFoundError('User not found for the given auth ID');
  }

  if (!user.organization) {
      throw new NotFoundError('Organization not found');
  }

  const program = await prisma.program.create({
      data: {
          name,
          duration,
          price,
          description,
          userId: user.id,
          organizationId: user.organizationId,
      },
  });

  return program;
};

const updatePrograms = async ({
  price,
  description,
  programId,
  authSub,
}) => {
  const user = await prisma.user.findUnique({
      where: { uniqueAuthId: authSub },
      include: { organization: true },
  });

  if (!user) {
      throw new NotFoundError('User not found for the given auth ID');
  }

  const userID = user.id;

  if (!user.organization) {
      throw new NotFoundError('Organization not found');
  }
  const program = await prisma.program.findUnique({
      where: { id: programId },
  });

  if (!program) {
      throw new NotFoundError('program not found for your organization');
  }

  const updatedProgram = await prisma.program.update({
      where: { 
        id:  programId,
      },
      data: {
          price: price,
          description: description,
      },
    })
    return updatedProgram
};

const deletePrograms = async ({
  programName,
  programId,
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
  const program = await prisma.program.findUnique({
      where: { id: programId },
  });

  if (!program) {
      throw new NotFoundError('program not found for your organization');
  }

  if (program.name !== programName) {
      throw new BadRequestError('Program name does not match');
  }
  
  const deletedProgram = await prisma.program.update({
      where: { 
        id: programId,
        name: programName,
      },
      data: {
          active: false,
      },
  });
  return deletedProgram;
}

module.exports = {
  findOrganizationByAuthSub,
  createOrganizationAndUser,
  updateOrganization,
  updateUser,
  inviteUser,
  updateNotesTemplate,
  resetNotesTemplate,
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
}

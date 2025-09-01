const { PrismaClient } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../errors/HttpError');

const prisma = new PrismaClient();

// List user contexts or org default contexts based on role
async function listContexts({ authSub }) {
  const user = await prisma.user.findFirst({
    where: { uniqueAuthId: authSub },
    include: { role: true },
  });
  if (!user) throw new NotFoundError('User not found');

  const isAdmin = user.role.name === 'Admin';

  if (isAdmin) {
    const defaultContexts = await prisma.defaultContextProgram.findMany({
      where: {
        defaultContext: {
          organizationId: user.organizationId,
        },
      },
      include: {
        defaultContext: true,
        program: true,
      },
      orderBy: {
        weekNumber: 'asc',
      },
    });

    return {
      type: 'DEFAULT_CONTEXT',
      data: defaultContexts.map((entry) => ({
        id: entry.defaultContext.id,
        weekNumber: entry.weekNumber,
        programName: entry.program?.name,
        contextText: entry.defaultContext.contextText,
      })),
    };
  } else {
    const contexts = await prisma.contextProgram.findMany({
      where: {
        userId: user.id,
      },
      include: {
        context: true,
        program: true,
      },
      orderBy: {
        weekNumber: 'asc',
      },
    });

    return {
      type: 'CONTEXT',
      data: contexts.map((entry) => ({
        id: entry.context.id,
        weekNumber: entry.weekNumber,
        programName: entry.program?.name,
        contextText: entry.context.contextText,
      })),
    };
  }
}

// Update a user-specific Context (uses ContextProgram table)
async function updateContext({ authSub, contextId, contextText }) {
  const user = await prisma.user.findFirst({
    where: { uniqueAuthId: authSub },
    include: { role: true },
  });
  if (!user) throw new NotFoundError('User not found');

  const context = await prisma.context.findUnique({
    where: { id: Number(contextId) },
  });
  if (!context) throw new NotFoundError('Context not found');

  const contextProgram = await prisma.contextProgram.findFirst({
    where: { contextId: context.id },
  });
  if (!contextProgram) throw new NotFoundError('ContextProgram not found');

  const isOwner = context.userId === user.id || contextProgram.userId === user.id;
  const isAdmin = user.role.name === 'Admin';

  if (!isOwner && !isAdmin) throw new ForbiddenError('Not allowed');

  const updated = await prisma.context.update({
    where: { id: context.id },
    data: { contextText },
  });

  return updated;
}

// Update an org-level DefaultContext (uses DefaultContextProgram table)
async function updateDefaultContext({ authSub, defaultContextId, contextText }) {
  const user = await prisma.user.findFirst({
    where: { uniqueAuthId: authSub },
    include: { role: true },
  });
  if (!user) throw new NotFoundError('User not found');
  if (user.role.name !== 'Admin') throw new ForbiddenError('Admin only');

  const defaultCtx = await prisma.defaultContext.findUnique({
    where: { id: Number(defaultContextId) },
  });
  if (!defaultCtx) throw new NotFoundError('DefaultContext not found');

  const defaultContextProgram = await prisma.defaultContextProgram.findFirst({
    where: { defaultContextId: defaultCtx.id },
  });
  if (!defaultContextProgram)
    throw new NotFoundError('DefaultContextProgram not found');

  if (defaultCtx.organizationId !== user.organizationId)
    throw new ForbiddenError('Cross-org update blocked');

  const updated = await prisma.defaultContext.update({
    where: { id: defaultCtx.id },
    data: { contextText },
  });

  return updated;
}

module.exports = {
  listContexts,
  updateContext,
  updateDefaultContext,
};
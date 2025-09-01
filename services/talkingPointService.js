// services/talkingPointService.js

const {
  PrismaClient,
  TalkingPointState,
  AppointmentStatus,
  ProgramStatus
} = require('@prisma/client');

const { generateTalkingPointsFromTemplate } = require('../utils/talkingPointsUtils');
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} = require('../errors/HttpError');

const prisma = new PrismaClient();

async function generateTalkingPoints({ appointmentId, authSub }) {
  // 0. Resolve coach (user)
  console.log("Generating talking points for appointmentId:", appointmentId);
  const user = await prisma.user.findFirst({
    where: { uniqueAuthId: authSub },
  });
  if (!user) throw new NotFoundError('User not found');

  // 1. Fetch appointment
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { client: true },
  });
  if (!appointment) throw new NotFoundError('Appointment not found');

  // 2. Idempotency check
  if (appointment.talkingPointState === TalkingPointState.GENERATING)
    throw new BadRequestError('Talking‑points generation already in progress');
  if (appointment.talkingPointState === TalkingPointState.GENERATED)
    return appointment.talkingPoints;

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { talkingPointState: TalkingPointState.GENERATING },
  });

  try {
    // 3. Session / week number
    const previousAppointments = await prisma.appointment.findMany({
      where: {
        clientId: appointment.clientId,
        status: AppointmentStatus.SUCCEEDED,
        scheduleStartAt: { lt: appointment.scheduleStartAt },
      },
      orderBy: { date: 'asc' },
    })

    const sessionNumber = previousAppointments.length + 1
    console.log(
      'Session number for appointmentId:',
      appointmentId,
      'is:',
      sessionNumber
    )
    // 4. Previous notes
    const lastNotes = previousAppointments
      .filter(a => a.notes) // only keep ones that have a notes field
      .map(a => {
        // 1) stringify the JSON (with 2-space indent for readability)
        const notesText =
          typeof a.notes === 'string'
            ? a.notes
            : JSON.stringify(a.notes, null, 2)

        // 2) format the date as YYYY-MM-DD
        const date = a.scheduleStartAt.toISOString().split('T')[0]

        return `**${date}**\n${notesText}`
      })
      .join('\n\n')

    // 5. Resolve programId
    const activeProgram = await prisma.programToClient.findFirst({
      where: {
        clientId: appointment.clientId,
        ProgramStatus: ProgramStatus.ACTIVE,
      },
    })
    const programId = activeProgram?.programId ?? null

    // 6. Fetch contextText (custom → default)
    let contextText = null

    // 6a. Coach-specific context
    if (programId) {

      const customCtxProgram = await prisma.contextProgram.findFirst({
        where: {
          userId: user.id,
          programId,
          weekNumber: sessionNumber,
        },
        include: {
          context: true,
        },
      })

      if (customCtxProgram?.context?.contextText) {
        contextText = customCtxProgram.context.contextText
      }

      console.log(
        'Custom context text:',
        contextText,
        'for user:',
        user.id,
        'and programId:',
        programId,
        'appointmentId:',
        appointmentId
      )

      // 6b. Fallback to default org-level context
      if (!contextText) {
        const defaultCtxProgram = await prisma.defaultContextProgram.findFirst({
          where: {
            organizationId: user.organizationId,
            programId,
            weekNumber: sessionNumber,
          },
          include: {
            defaultContext: true,
          },
        })

        if (defaultCtxProgram?.defaultContext?.contextText) {
          contextText = defaultCtxProgram.defaultContext.contextText
        }
      }
    }

    // 7. Fetch static guide template
    const template = await prisma.template.findFirst({
      where: { userId: user.id, type: 'talkingPoint' },
      include: { defaultTemplate: true },
    })

    if (!template) {
      throw new NotFoundError('Talking point template not found')
    }

    let staticTemplate

    if (
      template.notesTemplate &&
      Object.keys(template.notesTemplate).length > 0
    ) {
      staticTemplate = template.notesTemplate
    } else if (template.defaultTemplate?.notesTemplate) {
      staticTemplate = template.defaultTemplate.notesTemplate
    } else {
      throw new NotFoundError('Talking point template not found')
    }

    // console.log("------session no. or week number------ : ",sessionNumber,"\n","------Static Template------ : ",staticTemplate, "\n------last notes------ : ",lastNotes,"\n------context text----- : ",contextText);

    // 8. Generate talking points
    const talkingPoints = await generateTalkingPointsFromTemplate(
      staticTemplate,
      lastNotes,
      contextText
    )

    // 9. Persist & return
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        talkingPoints,
        talkingPointState: TalkingPointState.GENERATED,
      },
    })

    return talkingPoints
  } catch (err) {
    // Rollback on failure
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { talkingPointState: TalkingPointState.PENDING },
    });
    throw err;
  }
}

module.exports = { generateTalkingPoints };
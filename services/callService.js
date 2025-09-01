const {
    PrismaClient,
    AppointmentStatus,
    AttachmentStatus,
} = require('@prisma/client');
const { KJUR } = require('jsrsasign');
const prisma = new PrismaClient();
const {
    createZoomMeetingUtils,
    startUrlUtils,
    generatePassword,
    addMeetingRregistrant,
    createMeetingPayload,
} = require('../utils/zoomUtils');
const {
    newAppointmentTalkingPoints,
  } = require('../utils/checkInUtils')
const {
    generateNotesForAppointment,
} = require('../utils/audioAppointmentUtils');
const { NotFoundError, BadRequestError } = require('../errors/HttpError');
const moment = require('moment-timezone');
const { end } = require('pdfkit');

const createMeeting = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (!user.organizationId) {
        throw new NotFoundError('Organization not found for given user');
    }

    const currentDate = new Date(
        new Date().toLocaleString('en-US', { timeZone: input.timeZone })
    );

    // Create start and end of the day in the given timezone
    const startOfDayInUTCISO = new Date(
        `${currentDate.toISOString().split('T')[0]}T00:00:00Z`
    ).toISOString();
    const endOfDayInUTCISO = new Date(
        `${currentDate.toISOString().split('T')[0]}T23:59:59.999Z`
    ).toISOString();

    let meetingToday = false;
    if(input.meetingStartTime > startOfDayInUTCISO && input.meetingStartTime < endOfDayInUTCISO){
        meetingToday = true;
    }

    if (input.clientId && meetingToday) {
        const alreadyAppointment = await prisma.appointment.findFirst({
            where: {
                clientId: input.clientId,
                scheduleStartAt: {
                    gte: startOfDayInUTCISO,
                    lt: endOfDayInUTCISO,
                },
                status: {
                    in: [
                        AppointmentStatus.SCHEDULED,
                        AppointmentStatus.RECORDING,
                    ],
                },
            },
        });
        if (alreadyAppointment) {
            throw new BadRequestError(
                'An appointment is already booked for the current day. New appointments for today are not allowed.'
            );
        }
    }

    let client;
    if (input.clientId) {
        if (input.clientEmail) {
            await prisma.client.update({
                where: {
                    id: parseInt(input.clientId),
                },
                data: {
                    email: input.clientEmail,
                },
            });
        }
        client = await prisma.client.findFirst({
            where: {
                id: parseInt(input.clientId),
                organization: {
                    id: user.organizationId,
                },
            },
        });
    } else {
        if (!input.clientName) {
            throw new BadRequestError('No client name provided');
        }
        const clientData = {
            name: input.clientName,
            organizationId: user.organizationId,
            ...(input.clientEmail && { email: input.clientEmail }),
        };
        client = await prisma.client.create({
            data: clientData,
        });
    }
    const duration = Math.ceil((input.endTime - input.startTime) / 60000);
    const password = await generatePassword({ passwordLength: 8 });
    const meetingStartTime = moment
        .utc(input.startTime)
        .tz(input.timeZone)
        .format();

    input.password = password;
    input.meetingStartTime = meetingStartTime;
    input.duration = duration;
    input.clientEmail = client.email;

    console.log('input in create meeting ', input);

    const payload = createMeetingPayload(input);
    console.log('payload in create meeting ', payload);

    const zoomUserId = user.zoomUserId;

    let userId = 'me';
    if (zoomUserId && zoomUserId != '') {
        userId = zoomUserId
    }

    console.log('Zoom User ID: ', userId);

    const meetingDetailsRes = await createZoomMeetingUtils({
        userId,
        payload,
    });

    console.log('meetingDetailsRes', meetingDetailsRes);

    const zoomMeeeetingData =  {
        meetingId: BigInt(meetingDetailsRes.id),
        meetingDescription: input.description,
        meetingPassword: meetingDetailsRes.encrypted_password,
        meetingTopic: meetingDetailsRes.topic,
        meetingTimezone: meetingDetailsRes.timezone,
        meetingStartUrl: meetingDetailsRes.start_url,
        meetingJoinUrl: meetingDetailsRes.join_url,
        ...(input.recurringMeeting && { recurring: true }),
        ...(input.recurringEndTimes && { endAfter: input.recurringEndTimes }),
        ...(input.recurringEndDate && { endDate: input.recurringEndDate }),
        ...(input.recurringInterval && { repeatInterval: input.recurringInterval }),
        ...(input.recurringMonthlyDay && { monthlyDay: input.recurringMonthlyDay }),
        ...(input.recurringMonthlyWeek && { monthlyWeek: input.recurringMonthlyWeek }),
        ...(input.recurringMonthlyWeekDay && { monthlyWeekDay: input.recurringMonthlyWeekDay }),
        ...(input.recurringWeeklyDays && { weeklyDays: input.recurringWeeklyDays }),
        ...(meetingDetailsRes.occurrences && { occurrences: meetingDetailsRes.occurrences }),
    }

    const createZoomMeeting = await prisma.zoomMeeting.create({
        data: zoomMeeeetingData,
    });
    const meetingId = meetingDetailsRes.id;

    const startAndEndTimeInUtc = (
        time,
        duration,
        timezone = meetingDetailsRes.timezone
    ) => {
        const startTime = moment.tz(time, timezone).utc().format();
        const endTime = moment(startTime).add(duration, 'minutes').format();
        return { startTime, endTime };
    };

    if (client.email) {
        console.log('Sending mail to client via zoom');
        const attendeePayload = {
            email: client.email,
            first_name: client.name,
            last_name: client.name,
        };

        await addMeetingRregistrant({
            meetingId: meetingId,
            payload: attendeePayload,
        })
    }

    let createdAppointment;
    let returnData;

    if (meetingDetailsRes.type == 2) {
        const { startTime, endTime } = startAndEndTimeInUtc(
            meetingDetailsRes.start_time,
            meetingDetailsRes.duration
        );
        const appointmentData = {
            title: meetingDetailsRes.topic,
            description: input.description,
            status: AppointmentStatus.SCHEDULED,
            scheduleStartAt: startTime,
            scheduleEndAt: endTime,
            isMultiMembers: input.isMultiMembers,
            organization: { connect: { id: user.organizationId } },
            // user: { connect: { id: user.id } },
            client: { connect: { id: client.id } },
            zoomMeeting: {
                connect: {
                    id: createZoomMeeting.id,
                },
            },
        };

        createdAppointment = await prisma.appointment.create({
            data: appointmentData,
        });
        if (createdAppointment) {
            returnData = {
                status: 'success',
                message: 'Meeting created successfully',
            };
        }
    } else if (meetingDetailsRes.type == 8) {
        const occurrences = meetingDetailsRes.occurrences;
        const { startTime, endTime } = startAndEndTimeInUtc(
            occurrences[0].start_time,
            meetingDetailsRes.duration
        );
        const appointmentData = {
            title: meetingDetailsRes.topic,
            description: input.description,
            status: AppointmentStatus.SCHEDULED,
            scheduleStartAt: startTime,
            scheduleEndAt: endTime,
            meetingOccurrenceId: occurrences[0].occurrence_id,
            isMultiMembers: input.isMultiMembers,
            organization: { connect: { id: user.organizationId } },
            // user: { connect: { id: user.id } },
            client: { connect: { id: client.id } },
            zoomMeeting: {
                connect: {
                    id: createZoomMeeting.id,
                },
            },
        };
        createdAppointment = await prisma.appointment.create({
            data: appointmentData,
        });

        async function createAppointmentsInTransaction() {
        const appointmentsData = occurrences.slice(1).map((occurrence) => {
            const { startTime, endTime } = startAndEndTimeInUtc(occurrence.start_time, meetingDetailsRes.duration);
            return {
                title: meetingDetailsRes.topic,
                description: input.description,
                status: AppointmentStatus.SCHEDULED,
                scheduleStartAt: startTime,
                scheduleEndAt: endTime,
                meetingOccurrenceId: occurrence.occurrence_id,
                isMultiMembers: input.isMultiMembers,
                organizationId: user.organizationId,
                // userId: user.id,
                clientId: client.id,
                zoomMeetingId: createZoomMeeting.id,
            };
        });
        
            prisma
                .$transaction(async (prisma) => {
                    await prisma.$executeRaw`BEGIN`;
        
                    try {
                        const createdAppointments = await prisma.appointment.createMany({
                            data: appointmentsData,
                        });
        
                        await prisma.$executeRaw`COMMIT`;
        
                        console.log(`Created ${createdAppointments.count} appointments`);
                    } catch (error) {
                        await prisma.$executeRaw`ROLLBACK`;
                        console.error('Error in createAppointmentsInTransaction:', error);
                    }
                })
                .finally(() => prisma.$disconnect());
        }
        
        // Fire-and-forget usage
        createAppointmentsInTransaction();

        if (createdAppointment) {
            returnData = {
                status: 'success',
                message: 'Recuring Meeting created successfully',
            };
        }
    }

   newAppointmentTalkingPoints({
        scheduledAppointment: createdAppointment,
    })

    return returnData;
};

const getMeetingDetails = async () => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: authSub,
        },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (!user.organizationId) {
        throw new NotFoundError('Organization not found for given user');
    }

    const currentDate = new Date().toISOString().split('T')[0];

    const meetingDetailsRes = await prisma.zoomMeeting.findMany({
        where: {
            meetingStartTime: {
                gte: new Date(currentDate + 'T00:00:00.000Z'),
                lt: new Date(currentDate + 'T23:59:59.999Z'),
            },
        },
    });

    for (i in meetingDetailsRes) {
        meetingDetailsRes[i].meetingId =
            meetingDetailsRes[i].meetingId.toString();
    }

    return meetingDetailsRes;
};

const startMeeting = async ({ appointmentId, authSub }) => {
    console.log('Starting meeting for appointmentId:', appointmentId);
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: authSub,
        },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (!user.organizationId) {
        throw new NotFoundError('Organization not found for given user');
    }

    let appointment = await prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            organizationId: user.organizationId,
        },
        include: {
            zoomMeeting: true,
        },
    });

    if (!appointment) {
        throw new NotFoundError('Appointment not found');
    }

    await prisma.appointment.update({
        where: {
            id: appointmentId,
        },
        data: {
            status: AppointmentStatus.MEETING_STARTED,
        },
    });

    return {
        status: 'success',
        message: 'Meeting started successfully',
    };
};

const addTemplate = async ({ appointmentId, templateId, authSub }) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: authSub,
        },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (!user.organizationId) {
        throw new NotFoundError('Organization not found for given user');
    }

    if (!templateId) {
        throw new NotFoundError('Template id not found');
    }

    let appointment = await prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            organizationId: user.organizationId,
        },
        include: {
            client: true,
        },
    });

    if (!appointment) {
        throw new NotFoundError('Appointment not found');
    }

    await prisma.appointment.update({
        where: {
            id: appointmentId,
        },
        data: {
            templateId: templateId,
        },
        include: {
            client: true,
        },
    });

    if (appointment.status == AppointmentStatus.WAITING_FOR_TEMPLATE_INPUT) {
        await generateNotesForAppointment({
            appointment: appointment,
            bucketName: process.env.S3_BUCKET_NAME,
        });
    }
    return {
        status: 'success',
        message: 'Template added successfully',
    };
};

const endMeeting = async ({ appointmentId, authSub }) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: authSub,
        },
    });
    if (!user) {
        throw new NotFoundError('User not found');
    }

    if (!user.organizationId) {
        throw new NotFoundError('Organization not found for given user');
    }

    let appointment = await prisma.appointment.findFirst({
        where: {
            id: appointmentId,
            organizationId: user.organizationId,
            userId: user.id,
        },
    });

    if (
        appointment?.status == AppointmentStatus.RECORDING ||
        appointment?.status == AppointmentStatus.MEETING_STARTED
    ) {
        console.log('appointment', appointment);
        await prisma.appointment.update({
            where: {
                id: appointmentId,
            },
            data: {
                status: AppointmentStatus.MEETING_ENDED,
            },
        });
        return {
            status: 'success',
            message: 'Meeting ended',
        };
    }

    throw new BadRequestError('Appointment is not found or in valid status');
};

module.exports = {
    createMeeting,
    getMeetingDetails,
    startMeeting,
    addTemplate,
    endMeeting,
};
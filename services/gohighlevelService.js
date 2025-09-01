const { NotFoundError, BadRequestError } = require("../errors/HttpError"); // Ensure this is correctly imported
const {
    PrismaClient,
    MessageType,
    MessageOwner,
    ProgramStatus,
    AppointmentStatus,
    OpportunityStatus,
} = require("@prisma/client");
const moment = require("moment-timezone");
const {
    createZoomMeetingUtils,
    startUrlUtils,
    generatePassword,
    addMeetingRregistrant,
    createMeetingPayload,
} = require("../utils/zoomUtils");

function pacificToUTC(dateString) {
    // interpret the string in PT, then convert to UTC Date
    return moment.tz(dateString, "America/Los_Angeles").utc().toDate();
}
const { newAppointmentTalkingPoints } = require("../utils/checkInUtils");

const prisma = new PrismaClient();

const STATUS_MAP = {
    new: AppointmentStatus.SCHEDULED,
    confirmed: AppointmentStatus.SCHEDULED,
    booked: AppointmentStatus.SCHEDULED,
    cancelled: AppointmentStatus.USER_CANCELLED,
    noshow: AppointmentStatus.NO_SHOW,
    rescheduled: AppointmentStatus.SCHEDULED,
    showed: AppointmentStatus.SHOWED,
};

const mappedOpportunityStatus = {
    won: OpportunityStatus.WON,
    lost: OpportunityStatus.LOST,
    unknown: OpportunityStatus.UNKNOWN,
};

const createContact = async (contactId) => {
    try {
        const data = await fetchAppointmentForContactId(contactId);
        if (!data) {
            throw new NotFoundError("Contact not found");
        }
        const latestAppointment = data.events.reduce((latest, event) => {
            if (!latest) return event;
            return new Date(event.startTime) > new Date(latest.startTime)
                ? event
                : latest;
        }, null);

        console.log(new Date(latestAppointment.startTime));
        console.log(new Date());
        if (new Date(latestAppointment.startTime) < new Date()) {
            console.log("Appointment is in the past");
            throw new BadRequestError("Appointment is in the past");
        }

        const hardCodedOrganizationId = 1;

        if (
            !latestAppointment ||
            (latestAppointment.appointmentStatus.toLowerCase() !==
                "confirmed" &&
                latestAppointment.appointmentStatus.toLowerCase() !== "new" &&
                latestAppointment.appointmentStatus.toLowerCase() !== "booked")
        ) {
            throw new NotFoundError("Appointment not found");
        }

        const contact = await fetchContactForContactId(contactId);
        if (!contact) {
            throw new NotFoundError("Contact not found");
        }

        let client = await prisma.client.findUnique({
            where: {
                goHighLevelContactId: contact.contact.id,
            },
        });
        if (!client) {
            client = await prisma.client.create({
                data: {
                    goHighLevelContactId: contact.contact.id,
                    name: contact.contact.fullNameLowerCase,
                    email: contact.contact.email,
                    phone: contact.contact.phone,
                    organizationId: hardCodedOrganizationId,
                },
            });
        }

        const existingAppointment = await prisma.appointment.findFirst({
            where: {
                clientId: client.id,
                status: AppointmentStatus.SCHEDULED,
            },
        });

        if (existingAppointment) {
            await prisma.appointment.update({
                where: {
                    id: existingAppointment.id,
                },
                data: {
                    status: AppointmentStatus.CANCELED,
                },
            });
        }

        // Fix: Use correct parameters for createZoomWorkflow
        const startTime = new Date(latestAppointment.startTime);
        const endTime = new Date(latestAppointment.endTime);
        const { meetingDetailsRes, createZoomMeeting, startAndEndTimeInUtc } =
            await createZoomWorkflow(startTime, endTime, client);

        let createdAppointment;
        let returnData;

        if (meetingDetailsRes.type == 2) {
            const { startTime, endTime } = startAndEndTimeInUtc(
                meetingDetailsRes.start_time,
                meetingDetailsRes.duration
            );
            const appointmentData = {
                title: meetingDetailsRes.topic,
                status: AppointmentStatus.SCHEDULED,
                scheduleStartAt: startTime,
                scheduleEndAt: endTime,
                organization: { connect: { id: hardCodedOrganizationId } },
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
                    status: "success",
                    message: "Meeting created successfully",
                };
            }
        } else if (meetingDetailsRes.type == 8) {
            // Similar fixes for recurring meetings...
            const occurrences = meetingDetailsRes.occurrences;
            const { startTime, endTime } = startAndEndTimeInUtc(
                occurrences[0].start_time,
                meetingDetailsRes.duration
            );
            const appointmentData = {
                title: meetingDetailsRes.topic,
                status: AppointmentStatus.SCHEDULED,
                scheduleStartAt: startTime,
                scheduleEndAt: endTime,
                meetingOccurrenceId: occurrences[0].occurrence_id,
                organization: { connect: { id: hardCodedOrganizationId } },
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
                const appointmentsData = occurrences
                    .slice(1)
                    .map((occurrence) => {
                        const { startTime, endTime } = startAndEndTimeInUtc(
                            occurrence.start_time,
                            meetingDetailsRes.duration
                        );
                        return {
                            title: meetingDetailsRes.topic,
                            // description: input.description, // Remove - undefined
                            status: AppointmentStatus.SCHEDULED,
                            scheduleStartAt: startTime,
                            scheduleEndAt: endTime,
                            meetingOccurrenceId: occurrence.occurrence_id,
                            // isMultiMembers: input.isMultiMembers, // Remove - undefined
                            organizationId: hardCodedOrganizationId, // Fix - use hardCodedOrganizationId instead of user.organizationId
                            // userId: user.id, // Remove - undefined
                            clientId: client.id,
                            zoomMeetingId: createZoomMeeting.id,
                        };
                    });

                prisma
                    .$transaction(async (prisma) => {
                        await prisma.$executeRaw`BEGIN`;

                        try {
                            const createdAppointments =
                                await prisma.appointment.createMany({
                                    data: appointmentsData,
                                });

                            await prisma.$executeRaw`COMMIT`;

                            console.log(
                                `Created ${createdAppointments.count} appointments`
                            );
                        } catch (error) {
                            await prisma.$executeRaw`ROLLBACK`;
                            console.error(
                                "Error in createAppointmentsInTransaction:",
                                error
                            );
                        }
                    })
                    .finally(() => prisma.$disconnect());
            }

            // Fire-and-forget usage
            createAppointmentsInTransaction();

            if (createdAppointment) {
                returnData = {
                    status: "success",
                    message: "Recurring Meeting created successfully",
                };
            }
        }

        newAppointmentTalkingPoints({
            scheduledAppointment: createdAppointment,
        });

        return returnData;
    } catch (error) {
        console.error("Error fetching appointment:", error);
        throw new BadRequestError("Failed to fetch appointment");
    }
};

const updateAppointment = async (contactId, customData) => {
    try {
        const contact = await fetchContactForContactId(
            contactId,
            customData.token
        );
        if (!contact) {
            throw new NotFoundError("Contact not found");
        }
        const appointments = await fetchAppointmentForContactId(
            contactId,
            customData.token
        );
        let client = await prisma.client.findUnique({
            where: {
                goHighLevelContactId: contactId,
            },
            include: {
                Appointment: true,
            },
        });
        if (!client) {
            // create the client here with the contactId
            client = await prisma.client.create({
                data: {
                    goHighLevelContactId: contact.contact.id,
                    name: contact.contact.fullNameLowerCase,
                    email: contact.contact.email,
                    phone: contact.contact.phone,
                    organizationId: 1,
                },
            });

            // copy all appointments from the contact to the client
            if (
                appointments &&
                appointments.events &&
                appointments.events.length > 0
            ) {
                await insertAppointments(
                    client.id,
                    appointments.events,
                    customData.notifyPhone
                );
            }

            return;
        }

        await syncAppointmentsForClient(
            client.Appointment,
            appointments.events,
            client.id,
            customData.notifyPhone
        );

        return;
    } catch (error) {
        console.error("Error updating appointment:", error);
        throw new BadRequestError("Failed to update appointment");
    }
};

const updateAppointmentOpportunity = async (opportunity) => {
    let client = await prisma.client.findUnique({
        where: {
            goHighLevelContactId: opportunity.contact_id,
        },
    });
    if (!client) {
        client = await prisma.client.create({
            data: {
                goHighLevelContactId: opportunity.contact_id,
                name: opportunity.full_name,
                email: opportunity.email,
                phone: opportunity.phone,
                organizationId: 1,
                opportunityStatus:
                    mappedOpportunityStatus[opportunity.status.toLowerCase()] ||
                    OpportunityStatus.UNKNOWN,
                opportunityValue: opportunity.lead_value || 0,
                opportunityId: opportunity.id,
            },
        });
    } else {
        client = await prisma.client.update({
            where: {
                id: client.id,
            },
            data: {
                opportunityStatus:
                    mappedOpportunityStatus[opportunity.status.toLowerCase()] ||
                    OpportunityStatus.UNKNOWN,
                opportunityValue: opportunity.lead_value || 0,
                opportunityId: opportunity.id,
            },
        });
    }
};

const fetchAppointmentForContactId = async (contactId, token) => {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}/appointments`;
    const options = {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-04-15",
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    };

    // Make the API call to fetch the appointment
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
};

const fetchContactForContactId = async (contactId, token) => {
    const url = `https://services.leadconnectorhq.com/contacts/${contactId}`;
    const options = {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Version: "2021-04-15",
            "Content-Type": "application/json",
            Accept: "application/json",
        },
    };

    // Make the API call to fetch the appointment
    const response = await fetch(url, options);
    const data = await response.json();
    return data;
};

async function insertAppointments(clientId, events, notifyPhone) {
    if (!Array.isArray(events) || events.length === 0) return;

    const client = await prisma.client.findFirst({
        where: { id: clientId },
    });

    // Process sequentially with proper async handling
    const newAppointments = [];
    
    for (const ev of events) {
        const key = String(ev.appointmentStatus || "").toLowerCase();
        const mappedStatus = STATUS_MAP[key];
        
        if (mappedStatus) {
            let zoomMeetingDetails;

            if (mappedStatus === AppointmentStatus.SCHEDULED) {
                const startTime = new Date(ev.startTime);
                const endTime = new Date(ev.endTime);
                zoomMeetingDetails = await createZoomWorkflow(
                    startTime,
                    endTime,
                    client
                );
            }

            const appointmentData = {
                clientId,
                scheduleStartAt: new Date(ev.startTime),
                scheduleEndAt: new Date(ev.endTime),
                status: mappedStatus,
                organizationId: 1,
                goHighLevelEventId: ev.id,
                title: ev.title,
                userNotificationPhone: notifyPhone,
            };

            console.log("appointmentData", appointmentData);

            if (zoomMeetingDetails) {
                appointmentData.zoomMeetingId =
                    zoomMeetingDetails.createZoomMeeting.id;
            }

            newAppointments.push(appointmentData);
        }
    }
    console.log("newAppointments", newAppointments);

    if (newAppointments.length > 0) {
        await prisma.appointment.createMany({
            data: newAppointments,
        });
    }
}

// Fix the syncAppointmentsForClient function
async function syncAppointmentsForClient(
    existing,
    events,
    clientId,
    notifyPhone
) {
    const eventsMap = events
        ? new Map(events.map((ev) => [ev.id, ev]))
        : new Map();
    const existingMap = existing
        ? new Map(existing.map((a) => [a.goHighLevelEventId, a]))
        : new Map();

    await prisma.$transaction(async (tx) => {
        for (const [eventId, app] of existingMap) {
            const ev = eventsMap.get(eventId);

            if (!ev) {
                if (app.status !== AppointmentStatus.USER_CANCELLED) {
                    await tx.appointment.update({
                        where: { id: app.id },
                        data: { status: AppointmentStatus.USER_CANCELLED },
                    });
                }
            } else {
                const key = (ev.appointmentStatus || "").toLowerCase();
                const mappedStatus =
                    STATUS_MAP[key] || AppointmentStatus.SCHEDULED;
                const startAt = pacificToUTC(ev.startTime);
                const endAt = pacificToUTC(ev.endTime);

                const needsUpdate =
                    app.status !== mappedStatus ||
                    app.scheduleStartAt.getTime() !== startAt.getTime() ||
                    app.scheduleEndAt.getTime() !== endAt.getTime();

                if (
                    needsUpdate &&
                    app.status !==
                        (AppointmentStatus.PAUSED ||
                            AppointmentStatus.SUCCEEDED)
                ) {
                    await tx.appointment.update({
                        where: { id: app.id },
                        data: {
                            status: mappedStatus,
                            scheduleStartAt: startAt,
                            scheduleEndAt: endAt,
                            userNotificationPhone: notifyPhone,
                        },
                    });
                }

                eventsMap.delete(eventId);
            }
        }

        // Fix: Create appointments with Zoom meeting IDs
        const toCreate = [];
        for (const ev of eventsMap.values()) {
            const key = (ev.appointmentStatus || "").toLowerCase();
            const mappedStatus = STATUS_MAP[key];
            if (!mappedStatus) continue;

            const client = await prisma.client.findFirst({
                where: { id: clientId },
            });

            let zoomMeetingDetails;
            if (mappedStatus === AppointmentStatus.SCHEDULED) {
                const startTime = new Date(ev.startTime);
                const endTime = new Date(ev.endTime);
                zoomMeetingDetails = await createZoomWorkflow(
                    startTime,
                    endTime,
                    client
                );
            }

            const appointmentData = {
                clientId,
                scheduleStartAt: pacificToUTC(ev.startTime),
                scheduleEndAt: pacificToUTC(ev.endTime),
                status: mappedStatus,
                organizationId: 1,
                goHighLevelEventId: ev.id,
                title: ev.title,
                userNotificationPhone: notifyPhone,
            };

            // Fix: Add Zoom meeting ID
            if (zoomMeetingDetails) {
                appointmentData.zoomMeetingId =
                    zoomMeetingDetails.createZoomMeeting.id;
            }

            toCreate.push(appointmentData);
        }

        if (toCreate.length) {
            await tx.appointment.createMany({
                data: toCreate,
                skipDuplicates: true,
            });
        }
    });
}

const createZoomWorkflow = async (startTime, endTime, client) => {
    const duration = moment
        .duration(moment(endTime).diff(moment(startTime)))
        .asMinutes();

    const password = await generatePassword({ passwordLength: 8 });
    let input = {};

    const meetingStartTime = moment
        .utc(startTime)
        .tz("America/Los_Angeles")
        .format();

    input.password = password;
    input.meetingStartTime = meetingStartTime;
    input.duration = duration;
    input.clientEmail = client.email;
    input.timeZone = "America/Los_Angeles";
    input.title = "Appointment with " + client.name;

    console.log("input in create meeting ", input);

    const payload = createMeetingPayload(input);
    console.log("payload in create meeting ", payload);

    let userId = "me";

    console.log("Zoom User ID: ", userId);

    const meetingDetailsRes = await createZoomMeetingUtils({
        userId,
        payload,
    });

    console.log("meetingDetailsRes", meetingDetailsRes);

    const zoomMeeeetingData = {
        meetingId: BigInt(meetingDetailsRes.id),
        meetingDescription: input.description,
        meetingPassword: meetingDetailsRes.encrypted_password,
        meetingTopic: meetingDetailsRes.topic,
        meetingTimezone: meetingDetailsRes.timezone,
        meetingStartUrl: meetingDetailsRes.start_url,
        meetingJoinUrl: meetingDetailsRes.join_url,
        ...(input.recurringMeeting && { recurring: true }),
        ...(input.recurringEndTimes && {
            endAfter: input.recurringEndTimes,
        }),
        ...(input.recurringEndDate && { endDate: input.recurringEndDate }),
        ...(input.recurringInterval && {
            repeatInterval: input.recurringInterval,
        }),
        ...(input.recurringMonthlyDay && {
            monthlyDay: input.recurringMonthlyDay,
        }),
        ...(input.recurringMonthlyWeek && {
            monthlyWeek: input.recurringMonthlyWeek,
        }),
        ...(input.recurringMonthlyWeekDay && {
            monthlyWeekDay: input.recurringMonthlyWeekDay,
        }),
        ...(input.recurringWeeklyDays && {
            weeklyDays: input.recurringWeeklyDays,
        }),
        ...(meetingDetailsRes.occurrences && {
            occurrences: meetingDetailsRes.occurrences,
        }),
    };

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
        const endTime = moment(startTime).add(duration, "minutes").format();
        return { startTime, endTime };
    };

    if (client.email) {
        console.log("Sending mail to client via zoom");
        const attendeePayload = {
            email: client.email,
            first_name: client.name,
            last_name: client.name,
        };

        await addMeetingRregistrant({
            meetingId: meetingId,
            payload: attendeePayload,
        });
    }

    return {
        meetingDetailsRes,
        createZoomMeeting,
        startAndEndTimeInUtc,
    };
};

module.exports = {
    createContact,
    updateAppointment,
    updateAppointmentOpportunity,
};

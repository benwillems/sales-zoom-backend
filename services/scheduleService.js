const {
    PrismaClient,
    AppointmentStatus,
    AttachmentStatus,
} = require('@prisma/client');
const { KJUR } = require('jsrsasign');
const prisma = new PrismaClient();
const {
    createScheduleUtils,
    getScheduleDetailsUtils,
    getZoomMeetingDetailsUtils,
    updateScheduleUtils,
    deleteScheduleUtils,
    updateScheduleStatusUtils,
    scheduleUrlUtils,
} = require('../utils/zoomUtils');
const {
    generateNotesForAppointment,
} = require('../utils/audioAppointmentUtils');
const { NotFoundError, BadRequestError } = require('../errors/HttpError');
const moment = require('moment-timezone');
const { end } = require('pdfkit');
const { get } = require('../routes');

const createSchedule = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    if(!user.organizationId) {
        throw new BadRequestError('Organization not found for given user');
    }

    if(!(input.duration) || input.duration <= 0) {
        throw new BadRequestError('Invalid duration');
    }

    
    if(!/^#[0-9A-F]{6}$/i.test(input.color)) {
        input.color = '#000000';
    }
    

    // hardcoded values for now
    const email = '9fccmfpjsswmow63tlll1q@scheduler.zoom.us';
    const scheduleInput = {...input, email: email,};  

    const schedule = await createScheduleUtils(scheduleInput);
    return schedule;
}

const getScheduleDetails = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    if(!user.organizationId) {
        throw new BadRequestError('Organization not found for given user');
    }

    const zoomUserId = user.zoomUserId;

    const scheduleDetails = await getScheduleDetailsUtils();
    const scheduleUrl = await scheduleUrlUtils({
        zoomUserId: zoomUserId,
    });

    scheduleDetails['schedule_url_main'] = scheduleUrl;

    return scheduleDetails;

}

const createScheduleWebhook = async (input) => {
    const isZoomMeetingAvailable = await prisma.zoomMeeting.findFirst({
        where: {
            meetingId: input.meetingId,
        },
    })

    if(isZoomMeetingAvailable)   {
        throw new NotFoundError('Zoom Meeting already exists');
    }

    const user = await prisma.user.findFirst({
        where: {
            zoomAccountId: input.accountId,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    console.log("User Details")
    console.log(user);

    console.log("Input Details")
    console.log(input);

    const meetingDetails = await getZoomMeetingDetailsUtils({
        meetingId: input.meetingId,
    });
    console.log("Meeting Details")
    console.log(meetingDetails);

    console.log("Meeting Invitees")
    console.log(meetingDetails.settings.meeting_invitees);

    const clientEmail = meetingDetails.settings.meeting_invitees.find(invitee => !invitee.internal_user && invitee.email != user.email && invitee.email != meetingDetails.host_email).email;
    const meetingName = meetingDetails.topic;
   
    const clientName = meetingName.split('(')[1].split(')')[0];
    
    const zoomMeeting = await prisma.zoomMeeting.create({
        data: {
            meetingId: meetingDetails.id,
            meetingPassword: meetingDetails.password,
            meetingTopic: meetingName,
            meetingDescription: meetingDetails.agenda,
            meetingStartTime: meetingDetails.start_time,
            meetingDuration: meetingDetails.duration,
            meetingTimezone: meetingDetails.timezone,
            meetingStartUrl: meetingDetails.start_url,
            meetingJoinUrl: meetingDetails.join_url,           
        },
    });
    console.log("Zoom Meeting Details")
    console.log(zoomMeeting);

    const searchClient = await prisma.client.findFirst({
        where: {
            email: clientEmail,
        },
    })

    let clientDetails = null;

    if(!searchClient) {
        console.log("Client not found, creating new client");
        try{
            const createClient = await prisma.client.create({
                data: {
                    name: clientName,
                    email: clientEmail,
                    organizationId: user.organizationId,
                    timeZone: meetingDetails.timezone,
                },
            });
            
            clientDetails = createClient;
        }
        catch(error) {
            console.error('Error creating client:', error);
        }
    }
    else {
        console.log("Client found");        
        clientDetails = searchClient;
    }
    console.log("Client Details")
    console.log(clientDetails);

    const appointmentData = {
        title: meetingName,
        description: meetingDetails.agenda,
        status: AppointmentStatus.SCHEDULED,
        scheduleStartAt: meetingDetails.start_time,
        scheduleEndAt: moment(meetingDetails.start_time).add(meetingDetails.duration, 'minutes').toDate(),
        organizationId: user.organizationId,
        // userId: user.id,
        clientId: clientDetails.id,
        zoomMeetingId: zoomMeeting.id,
    };

    console.log("Appointment Data")
    console.log(appointmentData);

    const createAppointment = await prisma.appointment.create({
        data: appointmentData
    });
    console.log("Appointment Details")
    console.log(createAppointment);

}

const createScheduledEventWebhook = async (input) => {
    console.log('createScheduledEventWebhook called with input:', input)
    const eventTs = Number(input.event_ts)
    const meetingId = input.payload?.object?.scheduled_event?.external_location?.meeting_id
    const accountId = input.payload?.account_id
    const manageUrl = input.payload?.object?.manage_url
    const phoneNumber = input.payload?.object?.questions_and_answers
      ?.find(q => q.question === 'Phone Number')
      ?.answer[0].replace(/\s+/g, '')
    const zoomScheduledEventId = input.payload?.object?.scheduled_event?.event_id
    const clientEmail = input.payload?.object?.invitee_email
    const clientName =
      input.payload?.object?.invitee_first_name +
      ' ' +
      input.payload?.object?.invitee_last_name


    let zoomMeeting = await prisma.zoomMeeting.findFirst({
      where: {
        meetingId: parseInt(meetingId),
      },
      include: { appointments: true },
    })

    if (
      zoomMeeting?.lastEventTs != null &&
      zoomMeeting.lastEventTs >= eventTs
    ) {
      console.log('Stale create event for meeting', meetingId, '; ignoring.')
      return null
    }

    const meetingDetails = await getZoomMeetingDetailsUtils({
      meetingId: meetingId,
    })

    const meetingName = meetingDetails.topic
    const user = await prisma.user.findFirst({
      where: {
        zoomAccountId: accountId,
      },
    })
    if (!user) {
      throw new NotFoundError('User not found')
    }

    const searchClient = await prisma.client.findFirst({
      where: {
        email: clientEmail,
      },
    })

    let clientDetails = null
    if (!searchClient) {
      console.log('Client not found, creating new client')
      try {
        const createClient = await prisma.client.create({
          data: {
            name: clientName,
            email: clientEmail,
            phone: phoneNumber,
            organizationId: user.organizationId,
            timeZone: meetingDetails.timezone,
          },
        })

        clientDetails = createClient
      } catch (error) {
        console.error('Error creating client:', error)
      }
    } else {
      console.log('Client found')
      if (!searchClient.phone || searchClient.phone === '') {
        console.log('Updating client phone number')
        await prisma.client.update({
          where: {
            id: searchClient.id,
          },
          data: {
            phone: phoneNumber,
          },
        })
      }
      clientDetails = searchClient
    }

    if (zoomMeeting) {
      zoomMeeting = await prisma.zoomMeeting.update({
        where: { id: zoomMeeting.id },
        data: {
          meetingPassword: meetingDetails.password,
          meetingTopic: meetingDetails.topic,
          meetingDescription: meetingDetails.agenda,
          meetingStartTime: meetingDetails.start_time,
          meetingDuration: meetingDetails.duration,
          meetingTimezone: meetingDetails.timezone,
          meetingStartUrl: meetingDetails.start_url,
          meetingJoinUrl: meetingDetails.join_url,
          meetingManageUrl: manageUrl,
          lastEventTs: eventTs,
        }
      })
      const app = await prisma.appointment.findFirst({
        where: { zoomScheduledEventId: zoomScheduledEventId },
      })
      return await prisma.appointment.update({
        where: { id: app.id },
        data: {
          title: meetingDetails.topic,
          description: meetingDetails.agenda,
          status: AppointmentStatus.SCHEDULED,
          scheduleStartAt: meetingDetails.start_time,
          scheduleEndAt: moment(meetingDetails.start_time)
            .add(meetingDetails.duration, 'minutes')
            .toDate(),
          clientId: clientDetails.id,
          zoomScheduledEventId,
          cancellationReason: null,
          cancellationBy: null,
          cancellationType: null,
          lastEventTs: eventTs,
        },
      })
    } else {
      zoomMeeting = await prisma.zoomMeeting.create({
        data: {
          meetingId: meetingDetails.id,
          meetingPassword: meetingDetails.password,
          meetingTopic: meetingName,
          meetingDescription: meetingDetails.agenda,
          meetingStartTime: meetingDetails.start_time,
          meetingDuration: meetingDetails.duration,
          meetingTimezone: meetingDetails.timezone,
          meetingStartUrl: meetingDetails.start_url,
          meetingJoinUrl: meetingDetails.join_url,
          meetingManageUrl: manageUrl,
        },
      })
    }

    const appointmentData = {
      title: meetingName,
      description: meetingDetails.agenda,
      status: AppointmentStatus.SCHEDULED,
      scheduleStartAt: meetingDetails.start_time,
      scheduleEndAt: moment(meetingDetails.start_time)
        .add(meetingDetails.duration, 'minutes')
        .toDate(),
      organizationId: user.organizationId,
      // userId: user.id,
      clientId: clientDetails.id,
      zoomMeetingId: zoomMeeting.id,
      zoomScheduledEventId: zoomScheduledEventId
    }

    const createAppointment = await prisma.appointment.create({
      data: appointmentData,
    })
    return createAppointment
}

const cancelScheduledEventWebhook = async input => {
  const eventTs = Number(input.event_ts)
  const accountId = input.payload?.account_id
  const manageUrl = input.payload?.object?.manage_url
  const phoneNumber = input.payload?.object?.questions_and_answers
    ?.find(q => q.question === 'Phone Number')
    ?.answer[0].replace(/\s+/g, '')
  const zoomScheduledEventId = input.payload?.object?.scheduled_event?.event_id

  const appt = await prisma.appointment.findFirst({
    where: { zoomScheduledEventId },
  })
  if (!appt) throw new NotFoundError('Appointment not found')

  // 2) If stale, ignore
  if (appt.lastEventTs != null && appt.lastEventTs >= eventTs) {
    console.log('Stale cancel event, ignoring.')
    return appt
  }

  const appointment = await prisma.appointment.update({
    where: {
      zoomScheduledEventId: zoomScheduledEventId,
    },
    data: {
      status: AppointmentStatus.USER_CANCELLED,
      cancellationReason: input.payload?.object?.cancellation?.reason,
      cancellationBy: input.payload?.object?.cancellation?.canceled_by,
      cancellationType: input.payload?.object?.cancellation?.canceler_type,
    },
  })

  return appointment
}

const updateSchedule = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    if(!user.organizationId) {
        throw new BadRequestError('Organization not found for given user');
    }
    if(!(input.duration) || input.duration <= 0) {
        throw new BadRequestError('Invalid duration');
    }
    
    if(!/^#[0-9A-F]{6}$/i.test(input.color)) {
        input.color = '#000000';
    }
    
    // hardcoded values for now
    const email = '9fccmfpjsswmow63tlll1q@scheduler.zoom.us';
    const scheduleInput = {...input, email: email,};  
    const schedule = await updateScheduleUtils(scheduleInput);
    return schedule;
}
const deleteSchedule = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    if(!user.organizationId) {
        throw new BadRequestError('Organization not found for given user');
    }
    const deletedSchedule = deleteScheduleUtils({ scheduleId: input.scheduleId });
    return deletedSchedule;
}
const updateScheduleStatus = async (input) => {
    const user = await prisma.user.findFirst({
        where: {
            uniqueAuthId: input.authSub,
        },
    })
    if (!user) {
        throw new NotFoundError('User not found');
    }
    if(!user.organizationId) {
        throw new BadRequestError('Organization not found for given user');
    }
    const schedule = updateScheduleStatusUtils(input);
    return schedule;
}


module.exports = {
  createSchedule,
  getScheduleDetails,
  createScheduleWebhook,
  updateSchedule,
  deleteSchedule,
  updateScheduleStatus,
  createScheduledEventWebhook,
  cancelScheduledEventWebhook
}
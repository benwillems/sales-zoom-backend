const { NotFoundError, BadRequestError } = require('../errors/HttpError'); // Ensure this is correctly imported
const { PrismaClient, LeadsCallStatus, LeadCampaignStatus, CampaignStatus } = require('@prisma/client');
const { cleanUpPhoneNumber } = require('../utils/checkInUtils');
const { callUser } = require('../utils/phoneUtils');
const prisma = new PrismaClient();
const schedule = require('node-schedule');
const { duration } = require('moment-timezone');

const makeAgentCall = async ({ clientName, phoneNumber, email }) => {
    const callUserResponse = await callUser(
        cleanUpPhoneNumber(phoneNumber),
        process.env.PATHWAY_ID,
        clientName
    );
    const status =
        callUserResponse.status == 'success'
            ? LeadsCallStatus.CALL_SENT
            : LeadsCallStatus.CALL_FAILED;
    let leads;
    try {
        leads = await prisma.leads.create({
            data: {
                name: clientName,
                phone: phoneNumber,
                email: email,
                status: status,
                callId: callUserResponse.call_id
            },
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        throw new BadRequestError('Failed to create lead');
    }
    const leadsCall = makeLeadCall({lead: leads});
};

const makeAgentCallOnNewContact = async ({
    contactId,
    locationId,
    name,
    email,
    phone,
    calendarId,
    tags
}) => {
    let tagsArray = tags.split(',')
    console.table({contactId, locationId, name, email, phone, calendarId, tagsArray})
    let leads;
    try {
        leads = await prisma.leads.create({
            data: {
                name: name,
                phone: phone,
                email: email,
                crmContactId: contactId,
                crmLocationId: locationId,
                crmCalendarId: calendarId,
                tags: tagsArray
            }
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        throw new BadRequestError('Failed to create lead');
    }
    const leadsCall = makeLeadCall({lead: leads});
};

const makeLeadCall = async ({ lead }) => {
    
    const calledDate = new Date();
    const callUserResponse = await callUser(
        cleanUpPhoneNumber(lead.phone),
        process.env.PATHWAY_ID,
        lead.name,
        lead.tags
    );
    const status =
        callUserResponse.status == 'success'
            ? LeadsCallStatus.CALL_SENT
            : LeadsCallStatus.CALL_FAILED;
    const leadsCall = await prisma.leadsCall.create({        
        data: {
            leadsId: lead.id,
            calledDate: calledDate,
            status: status,
            callId: callUserResponse.call_id,
        },
    });
    return leadsCall;
}
const addCallResult = async (callDetails) => {
    if (callDetails.completed) {
        const leadsCall = await prisma.leadsCall.findFirst({
            where: {
                callId: callDetails.call_id,
            }
        })
        let status = LeadsCallStatus.MEETING_BOOKED;
        if (leadsCall.status != status) {
            status = LeadsCallStatus.CALL_FAILED;
        }
        return await prisma.leadsCall.update({
            where: {
                callId: callDetails.call_id,
            },
            data: {
                status: status,
                duration: callDetails.call_length,
                transcript: callDetails.transcripts,
            },
        });
    }
};

const addCallCampaignResult = async (callDetails) => {
  if (callDetails.completed) {
    const leadsCall = await prisma.leadsCall.findFirst({
      where: { callId: callDetails.call_id },
      include: { leads: true },
    })

    const status =
      leadsCall.status === LeadsCallStatus.MEETING_BOOKED
        ? LeadsCallStatus.MEETING_BOOKED
        : LeadsCallStatus.CALL_FAILED

    await prisma.$transaction([
      prisma.leadsCall.update({
        where: { callId: callDetails.call_id },
        data: {
          status,
          duration: callDetails.call_length,
          transcript: callDetails.transcripts,
        },
      }),
      prisma.leads.update({
        where: { id: leadsCall.leads.id },
        data: { status: 'COMPLETED' },
      }),
    ])
  }
}

const getCalendarAvailability = async (
    callId,
    startDateTime = null,
    endDateTime = null
) => {
    // Helper function to check if value is in milliseconds
    const call = await prisma.leadsCall.findFirst({
        where: {
          callId: callId,
        },
        include: {
          leads:true
        }
    });

    if (!call || !call.leads.crmCalendarId) {
        throw new NotFoundError('Calendar not found for the call');
    }

    const isMilliseconds = (value) => {
        return typeof value === 'number' && value.toString().length === 13;
    };

    // Helper function to convert any date input to Date object
    const parseDateTime = (dateInput) => {
        if (dateInput === null) return null

        if (isMilliseconds(dateInput)) {
            return new Date(dateInput)
        }

        try {
          const parsed = new Date(dateInput)
          return isNaN(parsed.getTime()) ? null : parsed
        } catch {
          return null
        }
    }

    // Set default values
    const now = new Date();
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;

    // Parse and validate input dates
    const parsedStartDate = parseDateTime(startDateTime);
    const parsedEndDate = parseDateTime(endDateTime);

    // Set effective dates based on requirements
    const effectiveStartDate = parsedStartDate || now;
    const effectiveEndDate =
        parsedEndDate || new Date(effectiveStartDate.getTime() + oneWeekInMs);

    // Validate dates
    if (effectiveEndDate <= effectiveStartDate) {
        throw new Error('End date must be after start date');
    }

    // Convert dates to millisecond timestamps
    const startMs = effectiveStartDate.getTime();
    const endMs = effectiveEndDate.getTime();

    // Construct URL with query parameters
    const baseUrl = `https://services.leadconnectorhq.com/calendars/${call.leads.crmCalendarId}/free-slots`;
    const url = `${baseUrl}?startDate=${startMs}&endDate=${endMs}`;

    const options = {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${process.env.GO_HIGH_LEVELS_TOKEN}`,
            Version: '2021-04-15',
            Accept: 'application/json',
        },
    };

    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching calendar availability:', error);
        throw error;
    }
};

const bookMeeting = async (slot, callId) => {
    // Parse the slot time to create start and end times
    const startTime = new Date(slot);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // Adding 1/2 hour for meeting duration

    const call = await prisma.leadsCall.findFirst({
        where: {
          callId: callId,
        },
        include: {
          leads: true
        }
    });
    // Prepare the API request body
    const requestBody = {
        calendarId: call.leads.crmCalendarId,
        locationId: call.leads.crmLocationId,
        contactId: call.leads.crmContactId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        title: call.leads.name,
    };

    // API endpoint and options
    const url =
        'https://services.leadconnectorhq.com/calendars/events/appointments';
    const options = {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.GO_HIGH_LEVELS_TOKEN}`,
            Version: '2021-04-15',
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(requestBody),
    };

    // Make the API call to book the appointment
    const response = await fetch(url, options);

    if (!response.ok) {
        const errorData = await response.json();
        throw new BadRequestError(
            `Failed to book appointment: ${
                errorData.message || response.statusText
            }`
        );
    }

    const apiData = await response.json();

    // Update the database with the booking information
    
    const leadsCall = await prisma.leadsCall.update({
        where: {
            callId: callId,
        },
        data: {
            status: LeadsCallStatus.MEETING_BOOKED,
            bookingDate: startTime,
            crmAppointmentId: apiData.id,
        },
    });

    await prisma.leads.update({
        where: {
            id: leadsCall.leadsId,
        },
        data: {
            recurrenceActive: false,
        }
    });


    return {
        success: true,
        message: `Meeting booked for ${startTime.toLocaleString('en-US', {
            timeZone: 'America/Los_Angeles',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'long',
        })}`,
        appointmentDetails: apiData,
    };
};

const fetchAllLeads = async () => {
    const leadsCall = await prisma.leadsCall.findMany({
        include: {
            leads: true,
            campaign: true
        }
    });
    return leadsCall.map(call => {
        const { leads, ...callData } = call;
        return {
            ...callData,
            ...leads
        };
    });
};

const createTemplate = async ({ name, body }) => {
  const userSchedule = body
  console.log(typeof userSchedule)
  console.log("userSchedule: ", userSchedule)
  
  const schedule = []
    for (let i = 0; i < userSchedule.length; i++) {
        const type = userSchedule[i].type.toLowerCase();
        let number = userSchedule[i].number;
        const time = userSchedule[i].time;
        if (type == 'weeks' || type == 'week') {
            number *= 7;
        }
        for (let j = 0; j < number; j++) {
            const timepush = {"time" : time};
            schedule.push(timepush);
        }
    }

    const totalDays = schedule.length

    const templateBody = {
     totalDays: totalDays,
     schedule: schedule
   }; 
    const template = await prisma.leadsTemplate.create({
        data: {
            name: name,
            template: templateBody,
            userTemplate: userSchedule,
        },
    });

    if (!template) {
        throw new Error('Failed to create template');
    }
    const updatedTemplates = await prisma.leadsTemplate.updateMany({
        where: {
            active: true,
            id: {
                not: template.id,
            },
        },
        data: {
            active: false,
        },
    });

    return template;
};

const fetchAllTemplates = async () => {
    const templates = await prisma.leadsTemplate.findMany({
        select: {
            id: true,
            name: true,
            userTemplate: true,
            active: true,
        },
    });
    if (!templates) {
        throw new Error('Failed to fetch templates');
    }
    return templates;
};

const setDefaultTemplate = async ({templateId}) => {
    const [_, template] = await prisma.$transaction([
        prisma.leadsTemplate.updateMany({
          data: { active: false },
        }),
        prisma.leadsTemplate.update({
          where: { id: templateId },
          data: { active: true },
        }),
      ]);
    if (!template) {
        throw new Error('Failed to set default template');
    }
    
    returnMessage = {
        success: true,
        message: `Default template set to ${template.name}`,
        userTemplate: template.userTemplate
    }

    return returnMessage;
};

const stopLeads = async ({leadId}) =>  {
    const lead = await prisma.leads.update({
        where: {
            id: leadId,
        },
        data: {
            recurrenceActive: false,
        },
    });

    if (!lead) {
        throw new Error('Failed to stop lead');
    }

    returnMessage = {
        success: true,
        message: `Lead ${lead.name} stopped`,
        id: lead.id,
        phone: lead.phone,
        email: lead.email,
    }

    return returnMessage;
}

const startLeads = async ({leadId}) => {
    const lead = await prisma.leads.findFirst({
        where: {
            id: leadId,
            recurrenceActive: false,
        },
    })
    if (!lead) {
        throw new BadRequestError('Lead not found or already active');
    }
    const leadUpdate = await prisma.leads.update({
        where: {
            id: leadId,
        },
        data: {
            recurrenceActive: true,
            recurrenceDate: new Date(),
        },
    });
    if (!leadUpdate) {
        throw new Error('Failed to start lead');
    }
    const returnMessage = {
        success: true,
        message: `Lead ${lead.name} started`,
        id: lead.id,
        phone: lead.phone,
        email: lead.email,
    }
    return returnMessage;
}

const leadsCallScheduler = async () => {
    console.log('Inside leadsCallScheduler');
    const activeTemplate = await prisma.leadsTemplate.findFirst({
        where: {
            active: true,
        },
    });
    if (!activeTemplate) {
        console.log(`No active template found at date: ${new Date()}`);
        return;
    }
    const leads = await prisma.leads.findMany({
        where: {
            recurrenceActive: true,
        },
    });
    if (!leads || leads.length === 0) {
        console.log(`No leads with recurrence active found at date: ${new Date()}`);
        return;
    }
    const totalTemplateDays = activeTemplate.template.totalDays;
    // make the foreach loop 
    leads.forEach(async (lead) => {
        const totalDaysFromRecurrence = Math.ceil((new Date() - new Date(lead.recurrenceDate)) / (1000 * 60 * 60 * 24));
        if (totalDaysFromRecurrence > totalTemplateDays) {
            await prisma.leads.update({
                where: {
                    id: lead.id,
                },
                data: {
                    recurrenceActive: false,
                },
            });
        }
        const timeArray = activeTemplate.template.schedule[totalDaysFromRecurrence]?.time;
        if (timeArray) {
            timeArray.forEach(async (time) => {
                const jobName = `call_${lead.id}_${time}`;
                const existingJob = schedule.scheduledJobs[jobName];
                if (existingJob) {
                    console.log(`Job for ${lead.name} at ${time} already exists, skipping.`);
                    return;
                }
                const [hours, minutes] = time.split(':').map(Number);
                const callTime = new Date();
                callTime.setHours(hours, minutes, 0, 0);
                schedule.scheduleJob(jobName, callTime, async () => {
                    console.log(`calling for: ${lead.name} at ${callTime}`);
                    // makeLeadCall({lead: lead});
                });
                console.log(`Scheduled call for ${lead.name} at ${callTime} with job name: ${jobName}`);
            });
        }
    });
    console.log('log all jobs at scheduler ');
    // print each job name at a time in loop
    for (const job in schedule.scheduledJobs) {
        console.log(job);
    }
};

const removeDefaultTemplate = async () => {
    const template = await prisma.leadsTemplate.updateMany({
        where: {
            active: true,
        },
        data: {
            active: false,
        },
    });
    if (!template) {
        throw new Error('Failed to remove default template');
    }

    const returnMessage = {
        success: true,
        message: `Default template removed`,
    }
    return returnMessage;
};

const fetchPipelinesByLocation = async (locationId) => {
    const url = `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${locationId}`
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.GO_HIGH_LEVELS_TOKEN}`,
        Version: '2021-04-15',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    }

    const response = await fetch(url, options)

     if (!response.ok) {
       const errorData = await response.json()
       throw new BadRequestError(
         `Failed to fetch pipelines: ${
           errorData.message || response.statusText
         }`
       )
     }

     const apiData = await response.json()

     return apiData
}

const searchOpportunities = async (pipelineStageId, locationId, startAfter, startAfterId) => {
    let url = `https://services.leadconnectorhq.com/opportunities/search?location_id=${locationId}&pipeline_stage_id=${pipelineStageId}`
    if (startAfter && startAfterId) {
        url += `&startAfter=${startAfter}&startAfterId=${startAfterId}`
    }
    const options = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.GO_HIGH_LEVELS_TOKEN}`,
        Version: '2021-04-15',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }
    }

    const response = await fetch(url, options)

     if (!response.ok) {
       const errorData = await response.json()
       throw new BadRequestError(
         `Failed fetching opportunities: ${
           errorData.message || response.statusText
         }`
       )
     }

     const apiData = await response.json()

     return apiData
}

const startCampaign = async(
  name,
  opportunities,
  pipelineId,
  pipelineStageId,
  calendarId,
  locationId
) => {
  const campaign = await prisma.campaign.create({
    data: {
      name,
      status: CampaignStatus.ACTIVE,
      pipelineId: pipelineId,
      pipelineStageId: pipelineStageId,
    },
  })

  for (const opp of opportunities) {
    if (opp.contact.phone) {
      await prisma.leads.upsert({
        where: { phone: opp.contact.phone },
        update: {
          campaignId: campaign.id,
          crmContactId: opp.contact.id,
          crmCalendarId: calendarId,
          crmLocationId: opp.locationId,
          status: LeadCampaignStatus.WAITING_TO_BE_CALLED,
          tags: opp.contact.tags || [],
        },
        create: {
          name: opp.contact.name,
          phone: opp.contact.phone,
          email: opp.contact.email,
          campaignId: campaign.id,
          crmContactId: opp.contact.id,
          crmCalendarId: calendarId,
          crmLocationId: opp.locationId,
          status: LeadCampaignStatus.WAITING_TO_BE_CALLED,
          tags: opp.contact.tags || [],
        },
      })
    }
  }

  return await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { leads: true },
  })
}

const campaignScheduler = async () => {
  // Get first active campaign
  const activeCampaign = await prisma.campaign.findFirst({
    where: { status: CampaignStatus.ACTIVE },
    include: { leads: true },
  })

  if (!activeCampaign) return

  // Check if any leads are in progress
  const inProgressLead = await prisma.leads.findFirst({
    where: {
      campaignId: activeCampaign.id,
      status: LeadCampaignStatus.IN_PROGRESS,
    },
  })

  if (inProgressLead) return

  // Get first waiting lead
  const waitingLead = await prisma.leads.findFirst({
    where: {
      campaignId: activeCampaign.id,
      status: LeadCampaignStatus.WAITING_TO_BE_CALLED,
    },
  })

  // If no waiting leads, mark campaign complete
  if (!waitingLead) {
    await prisma.campaign.update({
      where: { id: activeCampaign.id },
      data: { status: CampaignStatus.COMPLETED },
    })
    return
  }

  // Update lead status and initiate call
  await prisma.leads.update({
    where: { id: waitingLead.id },
    data: { status: LeadCampaignStatus.IN_PROGRESS },
  })

  // Trigger call service
  await initiateCall(waitingLead)
}

const initiateCall = async lead => {
  const calledDate = new Date()
  let callUserResponse
  try {
    callUserResponse = await callUser(
        cleanUpPhoneNumber(lead.phone),
        process.env.FLASH_SALE_PATHWAY_ID,
        lead.name,
        lead.tags,
        `${process.env.BACKEND_URL}/leads/call/campaign/result`
    )
  } catch (error) {
    console.log("Call user response error is ", error)
  }

  console.log("Call user response is: ", callUserResponse)

  const status =
    callUserResponse.status === 'success'
      ? LeadsCallStatus.CALL_SENT
      : LeadsCallStatus.CALL_FAILED

  const leadsCall = await prisma.leadsCall.create({
    data: {
      leadsId: lead.id,
      campaignId: lead.campaignId,
      calledDate: calledDate,
      status: status,
      callId: callUserResponse.call_id,
    },
  })

  if (status === LeadsCallStatus.CALL_FAILED) {
    await prisma.leads.update({
      where: { id: lead.id },
      data: { status: LeadCampaignStatus.FAILED },
    })
  }

  return leadsCall
}

module.exports = {
    makeAgentCall,
    getCalendarAvailability,
    bookMeeting,
    addCallResult,
    fetchAllLeads,
    makeAgentCallOnNewContact,
    createTemplate,
    fetchAllTemplates,
    setDefaultTemplate,
    stopLeads,
    startLeads,
    leadsCallScheduler,
    removeDefaultTemplate,
    fetchPipelinesByLocation,
    searchOpportunities,
    startCampaign,
    campaignScheduler,
    addCallCampaignResult
};

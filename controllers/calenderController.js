const { json } = require('express');
const { HttpError } = require('../errors/HttpError')
const { makeAgentCall, getCalendarAvailability, bookMeeting, addCallResult, fetchAllLeads, makeAgentCallOnNewContact, createTemplate, fetchAllTemplates, setDefaultTemplate, stopLeads, startLeads, removeDefaultTemplate, fetchPipelinesByLocation, searchOpportunities, startCampaign, addCallCampaignResult } = require('../services/leadsService')
const { addMicrosoftCalender, addMicrosoftCalenderWebhook } = require('../services/calenderService')
const { parseBoolean } = require('../utils/audioAppointmentUtils');
const { getScheduleDetailsUtils, makeNewSchedule } = require('../utils/zoomUtils');
const { getCalendarEvent } = require('../utils/microsoftUtils')

exports.addMicrosoftCalender = async (req, res) => {
    console.log(req.body);
    console.log(req.auth);

    const { userId, name, email, scope } = req.body;
    let authSub = req.auth?.sub
    console.table({ userId, name, email, scope, authSub });
    console.log(authSub);
    try {
        const event = await addMicrosoftCalender({
            userId,
            name,
            email,
            scope,
            authSub,
        });
        res.status(200).json(event);
    } catch (error) {
        console.error('Error creating event: ', error.message);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).send({ message: 'Internal Server Error' });
    }
}

// {
//   "value": [
//     {
//       "subscriptionId": "c6126aa3-0ed8-412f-a988-71e6cee627c4",
//       "subscriptionExpirationDateTime": "2025-05-30T03:12:18.2257768+05:30",
//       "changeType": "created",
//       "resource": "Users/622eaaff-0683-4862-9de4-f2ec83c2bd98/events/AAMkAGUwNjQ4ZjIxAAA=",
//       "resourceData": {
//         "@odata.type": "#Microsoft.Graph.Event",
//         "@odata.id": "Users/622eaaff-0683-4862-9de4-f2ec83c2bd98/events/AAMkAGUwNjQ4ZjIxAAA=",
//         "@odata.etag": "W/\"CQAAABYAAACQ2fKdhq8oSKEDSVrdi3lRAAGDUUXn\"",
//         "id": "AAMkAGUwNjQ4ZjIxAAA=",
//         "subject": "New Event",
//         "start": {
//           "dateTime": "2025-05-30T08:00:00.0000000",
//           "timeZone": "India Standard Time"
//         },
//         "end": {
//           "dateTime": "2025-05-30T09:00:00.0000000",
//           "timeZone": "India Standard Time"
//         }
//       },
//       "clientState": "client-defined-state",
//       "tenantId": "some-tenant-id"
//     }
//   ]
// }

// {
//   "value": [
//     {
//       "id": "G6dM5-X6T4Sucdq210mHmA",
//       "subscriptionId": "3980dd9d-f341-4f2c-87d5-e038c084cd4b",
//       "subscriptionExpirationDateTime": "2025-06-01T12:00:00.000Z",
//       "clientState": "clientStateValue123",
//       "changeType": "created",
//       "resource": "Users/ffe34b3e-fd1f-428a-858b-e754d53d9011/Events/Wy7VDpv6RmS8Ng0gEUaqnbPFYLzFfkttoLxp7TcVrw4=",
//       "tenantId": "01291ae9-9563-41f0-8f2b-ef84f9069e68",
//       "resourceData": {
//         "@odata.type": "#Microsoft.Graph.Event",
//         "@odata.id": "Users/ffe34b3e-fd1f-428a-858b-e754d53d9011/Events/Wy7VDpv6RmS8Ng0gEUaqnbPFYLzFfkttoLxp7TcVrw4=",
//         "@odata.etag": "W/\"JzEtVWFybk1EU2M4dHEzRW5KeExDaVdOVncNQ1JBPTIxN0U=\"",
//         "id": "Wy7VDpv6RmS8Ng0gEUaqnbPFYLzFfkttoLxp7TcVrw4=",
//         "subject": "Project Planning Meeting",
//         "organizer": {
//           "emailAddress": {
//             "name": "Alice Example",
//             "address": "alice@example.com"
//           }
//         },
//         "start": {
//           "dateTime": "2025-05-30T08:00:00",
//           "timeZone": "India Standard Time"
//         },
//         "end": {
//           "dateTime": "2025-05-30T09:00:00",
//           "timeZone": "India Standard Time"
//         },
//         "location": {
//           "displayName": "Conference Room 1"
//         },
//         "webLink": "https://outlook.office365.com/owa/?itemid=Wy7VDpv6RmS8Ng0gEUaqnbPFYLzFfkttoLxp7TcVrw4%3D&exvsurl=1&path=/calendar/item"
//       }
//     }
//   ]
// }

exports.addMicrosoftCalenderWebhook = async (req, res) => {

    const validationToken = req.query.validationToken;
    
    if (validationToken) {
        console.log('Webhook validation request received');
        // Return the validation token as plain text
        return res.status(200).send(validationToken);
    }

    console.log('Webhook received with body:', req.body);
    console.log('Event type:', req.body?.value?.[0]?.changeType);
    // console.log(req.body?.value?.[0]?.resourceData)
    // console.log(JSON.stringify(req.body?.value?.[0]?.resourceData))
    const tenantId = req.body?.value?.[0]?.tenantId;
    const resourceType = req.body?.value?.[0]?.resourceData?.['@odata.type'];

    if (req.body?.value?.[0].changeType === 'created') {
        const event = await getCalendarEvent(
          req.body?.value?.[0]?.resourceData?.['@odata.id']
        )
        const startTime = event.start?.dateTime
        const endTime = event.end?.dateTime
        const email = event.organizer?.emailAddress?.address
        const timeZone = event.start?.timeZone
        console.log('Event details:', event)
        try {
          console.log('Webhook received:', {
            tenantId,
            resourceType,
            startTime,
            endTime,
            email,
            timeZone,
          })

          const allSchedules = await getScheduleDetailsUtils()
          const oldScheduleArray = allSchedules.items

          let newScheduleArray = JSON.parse(JSON.stringify(oldScheduleArray))

          let temp = await addMicrosoftCalenderWebhook(
            tenantId,
            resourceType,
            startTime,
            endTime,
            email,
            timeZone,
            newScheduleArray
          )
          newScheduleArray = temp
          for (const schedule of oldScheduleArray) {
            for (const newSchedule of newScheduleArray) {
              if (
                schedule.schedule_id != undefined &&
                schedule.schedule_id == newSchedule.schedule_id
              ) {
                console.log(
                  `Found matching schedule ID: ${schedule.schedule_id}`
                )
                console.log(
                  `Updating schedule with ID: ${schedule.schedule_id}`
                )
                const updatedSchedule = await makeNewSchedule({
                  scheduleDetails: schedule,
                  newScheduleDetails: newSchedule,
                })
                console.log(`Schedule updated:`, updatedSchedule)
              }
            }
          }
          return res.status(200)
        } catch (error) {
          console.error('Error processing webhook: ', error.message)
          if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message })
          }
          return res.status(500).send({ message: 'Internal Server Error' })
        }
    }
    return res.status(200)
}

exports.addMicrosoftCalenderWebhook2 = async (req, res) => {
    const valueArray = req.body?.value || [];
    
    try {
        console.log(`Webhook received with ${valueArray.length} events`);
        
        const webhookResults = [];
        
        // Loop through each event in the value array
        for (let i = 0; i < valueArray.length; i++) {
            const event = valueArray[i];
            
            const tenantId = "event?.tenantId";
            const resourceType = "event?.resourceData?.['@odata.type']";
            const startTime = event?.start?.dateTime;
            const endTime = event?.end?.dateTime;
            const email = event?.organizer?.emailAddress?.address;
            const timeZone = event?.start?.timeZone;
            
            console.log(`Processing event ${i + 1}:`, {
                tenantId,
                resourceType,
                startTime,
                endTime,
                email,
                timeZone
            });

            try {
                const webhook = await addMicrosoftCalenderWebhook({
                    tenantId,
                    resourceType,
                    startTime,
                    endTime,
                    email,
                    timeZone
                });
                
                webhookResults.push({
                    index: i,
                    success: true,
                    data: webhook
                });
            } catch (eventError) {
                console.error(`Error processing event ${i + 1}:`, eventError.message);
                webhookResults.push({
                    index: i,
                    success: false,
                    error: eventError.message
                });
            }
        }
        
        res.status(200).json({
            totalEvents: valueArray.length,
            results: webhookResults,
            successCount: webhookResults.filter(r => r.success).length,
            errorCount: webhookResults.filter(r => !r.success).length
        });
    }
    catch (error) {
        console.error('Error processing webhook: ', error.message);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).send({ message: 'Internal Server Error' });
    }
}
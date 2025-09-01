const { json } = require('express');
const { HttpError } = require('../errors/HttpError')
const { makeAgentCall, getCalendarAvailability, bookMeeting, addCallResult, fetchAllLeads, makeAgentCallOnNewContact, createTemplate, fetchAllTemplates, setDefaultTemplate, stopLeads, startLeads, removeDefaultTemplate, fetchPipelinesByLocation, searchOpportunities, startCampaign, addCallCampaignResult } = require('../services/leadsService')
const { addMicrosoftCalender, addMicrosoftCalenderWebhook } = require('../services/calenderService')
const { parseBoolean } = require('../utils/audioAppointmentUtils');


exports.addMicrosoftCalenderWebhook = async (req, res) => {
    const tenantId = req.body?.value?.[0]?.tenantId;
    const resourceType = req.body?.value?.[0]?.resourceData?.['@odata.type'];
    const startTime = req.body?.value?.[0]?.resourceData?.start?.dateTime;
    const endTime = req.body?.value?.[0]?.resourceData?.end?.dateTime;
    const email = req.body?.value?.[0]?.resourceData?.organizer?.emailAddress?.address;
    const timeZone = req.body?.value?.[0]?.resourceData?.start?.timeZone;

    try {
        console.log('Webhook received:', {
            tenantId,
            resourceType,
            startTime,
            endTime,
            email,
            timeZone
        });

        const webhook = await addMicrosoftCalenderWebhook({
            tenantId,
            resourceType,
            startTime,
            endTime,
            email,
            timeZone
        });
        res.status(200).json(webhook);
    }
    catch (error) {
        console.error('Error processing webhook: ', error.message);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).send({ message: 'Internal Server Error' });
    }
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
const fetch = require('node-fetch');
const { NotFoundError, BadRequestError } = require('../errors/HttpError');
const fs = require('fs');
const { start } = require('repl');

const microsoftAccessToken = async () => {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.MICROSOFT_CLIENT_ID);
    params.append('client_secret', process.env.MICROSOFT_CLIENT_SECRET);
    params.append('scope', 'https://graph.microsoft.com/.default');

    const response = await fetch(url, {
        method: 'POST',
        body: params,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch access token');
    }

    const data = await response.json();
    return data.access_token;
}

const allCalendarEvents = async (userId) => {
    const accessToken = await microsoftAccessToken();
    // $select=subject,body,bodyPreview,organizer,attendees,start,end,location
    const startDate = new Date(); // Renamed to avoid conflict with imported 'start'
    const url = `${process.env.MICROSOFT_GRAPH_API_URL}users/${userId}/events?$select=subject,body,bodyPreview,organizer,attendees,start,end,location&$filter=start/dateTime ge '${startDate.toISOString()}'`;
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error('Failed to fetch calendar events');
    }

    const data = await response.json();
    return data.value;
}

const calendarEvents = async (userId) => {
    const events = await allCalendarEvents(userId);
    const calendarEvents = events.map(event => ({
        subject: "microsoftCalenderEvent",
        bodyPreview: "microsoftCalenderEvent",
        start: event.start.dateTime,
        end: event.end.dateTime,
    }));

    return calendarEvents;
}


const createEvent = async (userId, eventData) => {
    const accessToken = await microsoftAccessToken();
    const url = `${process.env.MICROSOFT_GRAPH_API_URL}users/${userId}/events`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventData),
    });

    if (!response.ok) {
        throw new Error('Failed to create calendar event');
    }

    const data = await response.json();
    return data;
}






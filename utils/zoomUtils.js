const fetch = require('node-fetch');
const { NotFoundError, BadRequestError } = require('../errors/HttpError');
const fs = require('fs');

const accessTokenJsonUtils = async () => {
    try {
        const zoomAccountID = process.env.ZOOM_SDK_ID;
        const zoomSdkKey = process.env.ZOOM_SDK_KEY;
        const zoomSdkSecret = process.env.ZOOM_SDK_SECRET;
        const accessUrl = `${process.env.ZOOM_ACCESS_TOKEN_URL}?grant_type=account_credentials&account_id=${zoomAccountID}`;

        const token = Buffer.from(
            `${zoomSdkKey}:${zoomSdkSecret}`,
            'utf8'
        ).toString('base64');
        const response = await fetch(accessUrl, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${token}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `HTTP error! status: ${response.status}, response: ${errorText}`
            );
        }

        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const createZoomMeetingUtils = async ({ userId, payload, clientEmail }) => {
    try {
        console.log('payload', payload);
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;

        const meetingUrl = `${process.env.ZOOM_API_URL}users/${userId}/meetings`;
        const response = await fetch(meetingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            
            throw new BadRequestError(' error creating zoom meeting' + errorText);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
};

const startUrlUtils = async ({ meetingUrl, accessToken }) => {
    try {
        const response = await fetch(meetingUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `HTTP error! status: ${response.status}, response: ${errorText}`
            );
        }

        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const zoomUserDetailsUtils = async ({ accessToken , userId }) => {
    try {
        // const response = await fetch(`${process.env.ZOOM_API_URL}users/me`, {
        const response = await fetch(`${process.env.ZOOM_API_URL}users/${userId}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `HTTP error! status: ${response.status}, response: ${errorText}`
            );
        }

        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const generatePassword = async ({ passwordLength }) => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < passwordLength; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

const deleteRecordingUtils = async ({ recordingUrl, accessToken }) => {
    try {
        const response = await fetch(recordingUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `HTTP error! status: ${response.status}, response: ${errorText}`
            );
        }
        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const addMeetingRregistrant = async ({ meetingId, payload }) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;

        const meetingUrl = `${process.env.ZOOM_API_URL}meetings/${meetingId}/registrants`;
        const response = await fetch(meetingUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `HTTP error! status: ${response.status}, response: ${errorText}`
            );
        }

        return await response.json();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
};

const createMeetingPayload = (input) => {
    let returnPayload;
    let approvalType = 2;
    if(input.clientEmail){
        approvalType = 0;
    }
    const payload = {
        agenda: input.title,
        default_password: false,
        duration: input.duration,
        password: input.password,
        start_time: input.meetingStartTime,
        timezone: input.timeZone,
        topic: input.title,
        breakout_room: {
            enable: true,
        },
        settings: {
            auto_recording: 'cloud',
            registrants_confirmation_email: true,
            registrants_email_notification: true,
            approval_type: approvalType,
        },
    };
    if (!input.recurringMeeting) {
        const type = {
            type: 2,
        };
        returnPayload = { ...payload, ...type };
    }
    else if (input.recurringMeeting) {
        const type = {
            type: 8,
        };
        if (input.recurringMeetingType == 1) {
            const recurrence = {
                recurrence: {
                    type: 1,
                    repeat_interval: input.recurringInterval,
                    ...(input.recurringEndTimes && { end_times: input.recurringEndTimes }),
                    ...(input.recurringEndDate && { end_date_time: input.recurringEndDate }),
                },
            };
            returnPayload = { ...payload, ...type, ...recurrence };
        }
        else if (input.recurringMeetingType == 2) {
            const recurrence = {
                recurrence: {
                    type: 2,
                    repeat_interval: input.recurringInterval,
                    
                    
                    ...(input.recurringEndTimes && { end_times: input.recurringEndTimes }),
                    ...(input.recurringEndDate && { end_date_time: input.recurringEndDate }),
                },
            };
            if (input.recurringWeeklyDays && Array.isArray(input.recurringWeeklyDays)) {
                const weeklyDays = input.recurringWeeklyDays.join(',');
                recurrence.recurrence.weekly_days = weeklyDays;
            }
            returnPayload = { ...payload, ...type, ...recurrence };
        }
        else if (input.recurringMeetingType == 3) {
            let recurrence;
            if(input.recurringMonthlyDay){
                recurrence = {
                    recurrence: {
                        type: 3,
                        repeat_interval: input.recurringInterval,
                        monthly_day: input.recurringMonthlyDay,
                        ...(input.recurringEndTimes && { end_times: input.recurringEndTimes }),
                        ...(input.recurringEndDate && { end_date_time: input.recurringEndDate }),
                    },
                };
            }
            else if (input.recurringMonthlyWeek && input.recurringMonthlyWeekDay) {
                recurrence = {
                    recurrence: {
                        type: 3,
                        repeat_interval: input.recurringInterval,
                        monthly_week: input.recurringMonthlyWeek,
                        monthly_week_day: input.recurringMonthlyWeekDay,
                        ...(input.recurringEndTimes && { end_times: input.recurringEndTimes }),
                        ...(input.recurringEndDate && { end_date_time: input.recurringEndDate }),
                    },
                };
            }
            else {
                throw new BadRequestError('Invalid monthly recurrence type');
            }
            returnPayload = { ...payload, ...type, ...recurrence };
        }
        else {
            throw new BadRequestError('Invalid recurring meeting type');
        }
    }
    return returnPayload;
};

async function schedulePayloadUtils(input) {
    const segments_recurrence = (schedule) => {
        const dayMap = {
            monday: 'mon',
            tuesday: 'tue',
            wednesday: 'wed',
            thursday: 'thu',
            friday: 'fri',
            saturday: 'sat',
            sunday: 'sun',
          };
        
          const result = {};
          for (const day in schedule) {
            if (dayMap[day] && Array.isArray(schedule[day]) && schedule[day].length > 0) {
              result[dayMap[day]] = schedule[day];
            }
          }
          return result;
    }
    const buffer = {
        after: input.buffer.after? parseInt(input.buffer.after): 0,
        before: input.bufferBefore ? parseInt(input.bufferBefore): 0,
    }
    let startDate = input.startDate;
    if(startDate == ''){
        startDate = new Date().toISOString().split('T')[0];
    }
    let endDate = input.endDate;
    if(endDate == ''){
        endDate = new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toISOString().split('T')[0];
    }
    const payload = {
        "add_on_type": "zoomMeeting",
        "availability_override": false,
        "availability_rules": [
            {
                "email": input.email,
                "segments_recurrence": segments_recurrence(input.schedule),
                "use_custom": true,
                "time_zone": input.timeZone,
            }
        ],
        "buffer": buffer,
        "color": input.color,
        "description": input.description,
        "duration": input.duration,
        "start_date": startDate,
        "end_date": endDate,
        "schedule_type": "one",
        "time_zone": input.timeZone,
        "active": true,
        "summary": input.name,
    }
    return payload;
}

async function createScheduleUtils (input)  {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;


        const payload = await schedulePayloadUtils(input);

        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error creating schedule: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating schedule:', error);
        throw error;
    }
};

async function getScheduleDetailsUtils (input) {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;

        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error fetching schedule details: ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching schedule details:', error);
        throw error;
    }
}

const getZoomMeetingDetailsUtils = async ({ meetingId }) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;

        const meetingUrl = `${process.env.ZOOM_API_URL}meetings/${meetingId}`;
        const response = await fetch(meetingUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new BadRequestError(' error creating zoom meeting' + errorText);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        throw error;
    }
};

const deleteScheduleUtils = async ({ scheduleId }) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;
        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules/${scheduleId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        if(!(response.status === 204)) {
            const errorText = await response.text();
            console.error('Response status:', response.status);
            console.error('Response headers:', response.headers);
            throw new Error(`Error updating schedule status: ${response.status} - ${errorText}`);
        }
        const res = {
            message: true,
            status: response.status,
            scheduleId: scheduleId,
        }
        return res;
    } catch (error) {
        console.error('Error deleting schedule:', error);
        throw error;
    }
}
const updateScheduleStatusUtils = async ({ scheduleId, status}) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;
        const payload = {
            active: status,
        };
        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules/${scheduleId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
                'Accept': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if(!(response.status === 204)) {
            const errorText = await response.text();
            console.error('Response status:', response.status);
            console.error('Response headers:', response.headers);
            throw new Error(`Error updating schedule status: ${response.status} - ${errorText}`);
        }
        const res = {
            message: true,
            status: response.status,
            scheduleId: scheduleId,
            active: status,
        }
        return res;
        
    } catch (error) {
        console.error('Error updating schedule status:', error);
        throw error;
    }
};
const updateScheduleUtils = async (input) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;
        const payload = await schedulePayloadUtils(input);
        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules/${input.scheduleId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });
        if(!(response.status === 204)) {
            const errorText = await response.text();
            console.error('Response status:', response.status);
            console.error('Response headers:', response.headers);
            throw new Error(`Error updating schedule: ${response.status} - ${errorText}`);
        }
        const res = {
            message: true,
            status: response.status,
            scheduleId: input.scheduleId,
        }
        return res;
    } catch (error) {
        console.error('Error updating schedule:', error);
        throw error;
    }
}

const scheduleUrlUtils = async ({ zoomUserId }) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;
        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/users/${zoomUserId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error fetching schedule url: ${errorText}`);
        }

        const data = await response.json();
        const url = data.scheduling_url;

        return url;

    } catch (error) {
        console.error('Error fetching schedule url:', error);
        throw error;
    }
}



const payloadEvents = (input) => {
    const payload = {
        name: input.name,
        description: input.description,
        timezone: input.timeZone,
        event_type: "SIMPLE_EVENT",
        access_level: "PRIVATE_RESTRICTED",
        meeting_type: "MEETING",
        categories: input.categories,
        calendar: [
            {
                start_time: input.startTime,
                end_time: input.endTime,
            }
        ],
        hub_id: input.hubId,
        attendance_type: "in-person",
        physical_location: input.physicalLocation
    }
    return payload;
}

const scheduleEventsInCalenderUtils = async (userId) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;
        const payload = payloadEvents(input);

        const url = `${process.env.ZOOM_API_URL}/zoom_events/events`;
        const response = await fetch(url, {
            methord: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        })

        return await response.json();
    } catch (error) {
        console.error('Error fetching schedule events:', error);
        throw error;
    }
};

const makeNewSchedule = async (input) => {
    try {
        const accessTokenRes = await accessTokenJsonUtils();
        const accessToken = accessTokenRes.access_token;


         const oldSchedule = input.scheduleDetails;

         const detetedSchedule = await deleteScheduleUtils({ scheduleId: oldSchedule.schedule_id });
        console.log('detetedSchedule', detetedSchedule);

        const newSchedulePayload = input.newScheduleDetails;

        const response = await fetch(`${process.env.ZOOM_API_URL}/scheduler/schedules`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(newSchedulePayload),
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error creating schedule: ${errorText}`);
        }
        const newSchedule = await response.json();
        console.log('New Schedule Created:', newSchedule);
        return newSchedule;


    } catch (error) {
        console.error('Error creating schedule:', error);
        throw error;
    }
};


module.exports = {
    accessTokenJsonUtils,
    createZoomMeetingUtils,
    startUrlUtils,
    zoomUserDetailsUtils,
    generatePassword,
    deleteRecordingUtils,
    addMeetingRregistrant,
    createMeetingPayload,
    createScheduleUtils,         
    schedulePayloadUtils,   
    getScheduleDetailsUtils,
    getZoomMeetingDetailsUtils,
    deleteScheduleUtils,
    updateScheduleStatusUtils,
    updateScheduleUtils,
    scheduleUrlUtils, 
    scheduleEventsInCalenderUtils,
    makeNewSchedule,
};

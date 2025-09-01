const { HttpError } = require('../errors/HttpError');
const {
    addTemplate,
    createMeeting,
    getMeetingDetails,
    startMeeting,
    endMeeting,
} = require('../services/callService');
const { parseBoolean } = require('../utils/audioAppointmentUtils');

exports.createMeeting = async (req, res) => {
    const { 
        topic, 
        description , 
        isMultiMembers, 
        startTime, 
        endTime, 
        timeZone, 
        clientId, 
        clientName,
        clientEmail,
        recurringMeeting,
        recurringMeetingType,
        recurringInterval,
        recurringWeeklyDays,
        recurringMonthlyDay,
        recurringMonthlyWeek,
        recurringMonthlyWeekDay,
        recurringEndTimes,
        recurringEndDate,
    } = req.body;
    let authSub = req.auth?.sub;
    try {
        const meetingDetails = await createMeeting({
            title: topic,
            description: description,
            isMultiMembers: parseBoolean(isMultiMembers) || false,
            startTime: new Date(startTime),
            endTime: new Date(endTime),
            timeZone: timeZone || "America/Los_Angeles",
            clientId: parseInt(clientId),
            clientName: clientName,
            clientEmail: clientEmail,
            recurringMeeting: parseBoolean(recurringMeeting) || false,
            recurringMeetingType: parseInt(recurringMeetingType),
            recurringInterval: parseInt(recurringInterval),
            recurringWeeklyDays: recurringWeeklyDays,
            recurringMonthlyDay: parseInt(recurringMonthlyDay),
            recurringMonthlyWeek: parseInt(recurringMonthlyWeek),
            recurringMonthlyWeekDay: parseInt(recurringMonthlyWeekDay),
            recurringEndTimes: parseInt(recurringEndTimes),
            recurringEndDate: recurringEndDate ? new Date(recurringEndDate).toISOString().split('.')[0] + 'Z' : null,
            authSub: authSub,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error creating meeting', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
};

exports.getMeetingDetails = async (req, res) => {
    try {
        const meetingDetails = await getMeetingDetails({
            
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error get meeting details:', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
}

exports.startMeeting = async (req, res) => {
    const { appointmentId } = req.params;
    let authSub = req.auth?.sub;
    try {
        const meetingDetails = await startMeeting({
            appointmentId: parseInt(appointmentId),
            authSub: authSub,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error start meeting details', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
};

exports.endMeeting = async (req, res) => {
    const { appointmentId } = req.params;
    let authSub = req.auth?.sub;
    try {
        const meetingDetails = await endMeeting({
            appointmentId: parseInt(appointmentId),
            authSub: authSub,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error end meeting details', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
};

exports.addTemplate = async (req, res) => {
    const { appointmentId } = req.params;
    const { templateId } = req.body;
    let authSub = req.auth?.sub;
    try {
        const meetingDetails = await addTemplate({
            appointmentId: parseInt(appointmentId),
            templateId: parseInt(templateId),
            authSub: authSub,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error end meeting details', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }
}

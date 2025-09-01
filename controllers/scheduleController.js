const e = require('express');
const { HttpError } = require('../errors/HttpError');
const {
  createSchedule,
  getScheduleDetails,
  createScheduleWebhook,
  updateSchedule,
  deleteSchedule,
  updateScheduleStatus,
  createScheduledEventWebhook,
  cancelScheduledEventWebhook
} = require('../services/scheduleService')
const { parseBoolean } = require('../utils/audioAppointmentUtils');

const crypto = require('crypto')


exports.createSchedule = async (req, res) => {
    const {
        name,
        description,
        timeZone,
        duration,
        schedule,
        startDate,
        endDate,
        buffer,
        color,

    } = req.body;
    let authSub = req.auth?.sub;
    try {
        const scheduleDetails = await createSchedule({
            name: name,
            description: description,
            timeZone: timeZone || "America/Los_Angeles",
            duration: duration ? parseInt(duration) : null,
            schedule: schedule,
            startDate: startDate,
            endDate: endDate,
            buffer: buffer,
            color: color,
            authSub: authSub,
        });
        return res.status(200).send(scheduleDetails);
    } catch (error) {
        console.error('Error creating schedule', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

exports.getScheduleDetails = async (req, res) => {
    let authSub = req.auth?.sub;
    try {
        const scheduleDetails = await getScheduleDetails({
            authSub: authSub,
        });
        return res.status(200).send(scheduleDetails);
    } catch (error) {
        console.error('Error getting schedule details', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

exports.createScheduleWebhook = async (req, res) => {
  console.log(req.body)
  const accountId = req?.body?.payload?.account_id
  const meetingId = req?.body?.payload?.object?.id
  try {
    const meetingDetails = await createScheduleWebhook({
        accountId: accountId,
        meetingId: meetingId,
    })
  } catch (error) {
    console.error('Error creating schedule webhook:', error)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).json({ error: 'Internal server error' })
  }
}

exports.createScheduledEventWebhook = async (req, res) => {
    try {
      // Webhook request event type is a challenge-response check
        if (req.body.event === 'endpoint.url_validation') {
            const hashForValidate = crypto
                .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
                .update(req.body.payload.plainToken)
                .digest('hex')

            res.status(200)
            res.json({
                plainToken: req.body.payload.plainToken,
                encryptedToken: hashForValidate,
            })
            return res
        }
        const meetingDetails = await createScheduledEventWebhook(req.body)
        return res.status(200)
    } catch (error) {
        console.error('Error creating scheduled event webhook:', error)
        if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ error: error.message })
        }
        return res.status(500).json({ error: 'Internal server error' })
    }
}

exports.cancelScheduledEventWebhook = async (req, res) => {
    try {
        if (req.body.event === 'endpoint.url_validation') {
            const hashForValidate = crypto
            .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
            .update(req.body.payload.plainToken)
            .digest('hex')

            res.status(200)
            res.json({
            plainToken: req.body.payload.plainToken,
            encryptedToken: hashForValidate,
            })
            return res
        }
        const meetingDetails = await cancelScheduledEventWebhook(req.body)
        return res.status(200)
    } catch (error) {
      console.error('Error creating scheduled event webhook:', error)
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ error: error.message })
      }
      return res.status(500).json({ error: 'Internal server error' })
    }
}

exports.updateSchedule = async (req, res) => {
    const {
        scheduleId,
        name,
        description,
        timeZone,
        duration,
        schedule,
        startDate,
        endDate,
        buffer,
        color,
    } = req.body;
    let authSub = req.auth?.sub;
    try {
        const scheduleDetails = await updateSchedule({
            scheduleId: scheduleId,
            name: name,
            description: description,
            timeZone: timeZone || "America/Los_Angeles",
            duration: duration ? parseInt(duration) : null,
            schedule: schedule,
            startDate: startDate,
            endDate: endDate,
            buffer: buffer,
            color: color,
            authSub: authSub,
        });
        return res.status(200).send(scheduleDetails);
    } catch (error) {
        console.error('Error creating schedule', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}
exports.deleteSchedule = async (req, res) => {
    const {
        scheduleId,
    } = req.body;
    let authSub = req.auth?.sub;
    try {
        const scheduleDetails = await deleteSchedule({
            scheduleId: scheduleId,
            authSub: authSub,
        });
        return res.status(200).send(scheduleDetails);
    } catch (error) {
        console.error('Error deleting schedule', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}
exports.updateScheduleStatus = async (req, res) => {
    const {
        scheduleId,
        status,
    } = req.body;
    let authSub = req.auth?.sub;
    try {
        const scheduleDetails = await updateScheduleStatus({
            scheduleId: scheduleId,
            status: parseBoolean(status),
            authSub: authSub,
        });
        return res.status(200).send(scheduleDetails);
    } catch (error) {
        console.error('Error updating schedule status', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Internal server error' });
    }
}

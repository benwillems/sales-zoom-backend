const { HttpError } = require('../errors/HttpError');
const {
    statedMeeting,
    endMeeting,
    recordingCompleted,
} = require('../services/meetingWebhookService');
const { parseBoolean } = require('../utils/audioAppointmentUtils');

const crypto = require('crypto')

exports.statedMeeting = async (req, res) => {
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
    const meetingId = req?.body?.payload?.object?.id;
    const meetingUUID = req?.body?.payload?.object?.uuid;
    try {
        const meetingDetails = await statedMeeting({
            meetingId: BigInt(meetingId),
            meetingUUID: meetingUUID,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error start meeting webhook:', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }  
}

exports.endedMeeting = async (req, res) => {
    console.log('endedMeeting ', req.body);
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
    const meetingId = req?.body?.payload?.object?.id;
    const meetingUUID = req?.body?.payload?.object?.uuid;
    try {
        const meetingDetails = await endMeeting({
            meetingId: BigInt(meetingId),
            meetingUUID: meetingUUID,
        });
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error end meeting webhook:', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }  
}

exports.recordingCompleted = async (req, res) => {
    console.log('recordingCompleted ');
    const body = req.body;
    console.log('recordingCompleted ', body);
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
    try {
        const meetingDetails = await recordingCompleted(body);
        return res.status(200).send(meetingDetails);
    } catch (error) {
        console.error('Error recording meeting webhook:', error);
        if (error instanceof HttpError) {
            return res.status(error.statusCode).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message });
    }  
}
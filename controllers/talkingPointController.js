// controllers/talkingPointController.js
const { HttpError, NotFoundError, BadRequestError } = require('../errors/HttpError');
const { generateTalkingPoints } = require('../services/talkingPointService');

/**
 * POST /talking‑points
 * req.body: { appointmentId }
 */
exports.generateTalkingPoints = async (req, res) => {
  const authSub = req.auth?.sub;
  const appointmentId = parseInt(req.body.appointmentId, 10);

  /* ── basic validation ── */
  if (!authSub) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }
  if (Number.isNaN(appointmentId)) {
    return res.status(400).json({ error: 'appointmentId must be a number' });
  }

  try {
    const talkingPoints = await generateTalkingPoints({ appointmentId, authSub });
    return res.status(200).json({ talkingPoints });
  } catch (error) {
    console.error('Error generating talking points:', error);

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

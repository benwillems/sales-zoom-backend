const { getAppointmentStatusAnalytics } = require('../services/appointmentAnalyticsService');
const { HttpError } = require('../errors/HttpError');

exports.getAppointmentAnalytics = async (req, res) => {
  const authSub = req.auth?.sub;

  if (!authSub) {
    return res.status(401).json({ error: 'Unauthenticated' });
  }

  const { startDate, endDate, userId, compare } = req.query;

  try {
    const analytics = await getAppointmentStatusAnalytics({
      authSub,
      startDate,
      endDate,
      userId: userId ? Number(userId) : undefined,
      compare: compare === 'true'
    });

    return res.status(200).json(analytics);
  } catch (error) {
    console.error('Error fetching appointment analytics:', error);

    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
const { PrismaClient, AppointmentStatus } = require('@prisma/client');
const { NotFoundError, ForbiddenError } = require('../errors/HttpError');

const prisma = new PrismaClient();

 
async function getAppointmentStatusAnalytics({ authSub, startDate, endDate, userId, compare = false }) {
  // 1. Get logged-in user and their role
  const user = await prisma.user.findFirst({
    where: { uniqueAuthId: authSub },
    include: { role: true },
  });
  
  if (!user) throw new NotFoundError('User not found');

  const isAdmin = user.role.name === 'Admin';
  if (!isAdmin) throw new ForbiddenError('Only Admins can access analytics');

  // 2. Get all users (coaches) under this org
  const usersInOrg = await prisma.user.findMany({
    where: { organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  const userIds = usersInOrg.map(u => u.id);

  // 3. Build appointment filter
  const appointmentFilter = {
    userId: { in: userIds }
  };
  
  if (startDate && endDate) {
    appointmentFilter.scheduleStartAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  }

  // 4. Fetch appointments with duration data
  const appointments = await prisma.appointment.findMany({
    where: appointmentFilter,
    select: {
      userId: true,
      status: true,
      currentTimerMili: true,
    },
  });
  
  // Log appointment status distribution
  const statusDistribution = {};
  appointments.forEach(appt => {
    statusDistribution[appt.status] = (statusDistribution[appt.status] || 0) + 1;
  });

  // 5. Process data including duration
  const statusCounts = {};
  const orgStatusCounts = {
    total: 0,
    SUCCEEDED: 0,
    NO_SHOW: 0,
    USER_CANCELLED: 0,
    FAILED: 0,
    TOTALDURATION: 0,
    AVERAGEDURATION: 0,
  };

  for (const appt of appointments) {
    const uid = appt.userId;
    const status = appt.status;
    const duration = appt.currentTimerMili || 0;

    if (!statusCounts[uid]) {
      statusCounts[uid] = {
        userId: uid,
        SUCCEEDED: 0,
        NO_SHOW: 0,
        USER_CANCELLED: 0,
        FAILED: 0,
        total: 0,
        TOTALDURATION: 0,
        AVERAGEDURATION: 0,
      };
    }

    statusCounts[uid][status]++;
    statusCounts[uid].total++;
    statusCounts[uid].TOTALDURATION += duration;

    orgStatusCounts[status]++;
    orgStatusCounts.total++;
    orgStatusCounts.TOTALDURATION += duration;
  }

  // Calculate average durations
  orgStatusCounts.AVERAGEDURATION = orgStatusCounts.total > 0 
    ? orgStatusCounts.TOTALDURATION / orgStatusCounts.total 
    : 0;

  // 6. Enrich with user names and duration stats
  const enrichedUsers = usersInOrg.map(user => {
    const stats = statusCounts[user.id] || {
      SUCCEEDED: 0,
      NO_SHOW: 0,
      USER_CANCELLED: 0,
      FAILED: 0,
      total: 0,
      TOTALDURATION: 0,
      AVERAGEDURATION: 0,
    };

    // Calculate average duration for this user
    const averageDurationMili = stats.total > 0 ? stats.TOTALDURATION / stats.total : 0;

    const enrichedUser = {
      userId: user.id,
      name: user.name,
      succeeded: stats.SUCCEEDED,
      noShow: stats.NO_SHOW,
      userCancelled: stats.USER_CANCELLED,
      failed: stats.FAILED,
      total: stats.total,
      successRate: stats.total > 0 ? stats.SUCCEEDED / stats.total : 0,
      noShowRate: stats.total > 0 ? stats.NO_SHOW / stats.total : 0,
      cancellationRate: stats.total > 0 ? stats.USER_CANCELLED / stats.total : 0,
      totalDurationMili: stats.TOTALDURATION,
      averageDurationMili: averageDurationMili,
      totalDurationMinutes: Math.floor(stats.TOTALDURATION / (1000 * 60)),
      averageDurationMinutes: Math.floor(averageDurationMili / (1000 * 60)),
      averageDurationSeconds: Math.floor((averageDurationMili % (1000 * 60)) / 1000),
    };
    
    return enrichedUser;
  });

  // 7. If comparison enabled
  let comparison = null;
  if (compare && userId) {
    const selected = enrichedUsers.find(u => u.userId === userId);
    const orgAvg = {
      successRate: orgStatusCounts.total > 0 ? orgStatusCounts.SUCCEEDED / orgStatusCounts.total : 0,
      noShowRate: orgStatusCounts.total > 0 ? orgStatusCounts.NO_SHOW / orgStatusCounts.total : 0,
      cancellationRate: orgStatusCounts.total > 0 ? orgStatusCounts.USER_CANCELLED / orgStatusCounts.total : 0,
      averageDurationMili: orgStatusCounts.AVERAGEDURATION,
      averageDurationMinutes: Math.floor(orgStatusCounts.AVERAGEDURATION / (1000 * 60)),
    };
    const topUser = enrichedUsers.reduce((prev, curr) => {
      const isCurrentBetter = curr.successRate > prev.successRate;
      return isCurrentBetter ? curr : prev;
    }, { successRate: -1 });

    comparison = {
      selectedUser: selected,
      orgAverage: orgAvg,
      topUser,
    };
  }

  // 8. Return result with duration stats
  const summary = {
      total: orgStatusCounts.total,
      succeeded: orgStatusCounts.SUCCEEDED,
      noShow: orgStatusCounts.NO_SHOW,
      userCancelled: orgStatusCounts.USER_CANCELLED,
      failed: orgStatusCounts.FAILED,
      successRate: orgStatusCounts.total > 0 ? orgStatusCounts.SUCCEEDED / orgStatusCounts.total : 0,
      noShowRate: orgStatusCounts.total > 0 ? orgStatusCounts.NO_SHOW / orgStatusCounts.total : 0,
      cancellationRate: orgStatusCounts.total > 0 ? orgStatusCounts.USER_CANCELLED / orgStatusCounts.total : 0,
      totalDurationMili: orgStatusCounts.TOTALDURATION,
      averageDurationMili: orgStatusCounts.AVERAGEDURATION,
      totalDurationMinutes: Math.floor(orgStatusCounts.TOTALDURATION / (1000 * 60)),
      averageDurationMinutes: Math.floor(orgStatusCounts.AVERAGEDURATION / (1000 * 60)),
      averageDurationSeconds: Math.floor((orgStatusCounts.AVERAGEDURATION % (1000 * 60)) / 1000),
  };
  
  const result = {
    summary,
    byUser: enrichedUsers,
    comparison,
  };
  
  return result;
}

module.exports = { getAppointmentStatusAnalytics };
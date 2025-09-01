const jobManager = require('../utils/jobManager')
const { receiveSms } = require('./phoneService')


class ClientScheduleService {
  scheduleClientCheckIn(clientId, checkInTime, phone) {
    const hours = checkInTime.getUTCHours()
    const minutes = checkInTime.getUTCMinutes()
    const cronSchedule = `${minutes} ${hours} * * *`

    jobManager.scheduleJob(clientId, cronSchedule, () => {
      console.log(`Performing daily check-in for client ${clientId}`)
      receiveSms(phone, '', true);
    })
  }

  removeClientCheckIn(clientId) {
    jobManager.cancelJob(clientId)
  }

  updateClientCheckIn(clientId, newCheckInTime, phone) {
    this.scheduleClientCheckIn(clientId, newCheckInTime, phone)
  }
}

module.exports = new ClientScheduleService()

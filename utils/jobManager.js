const schedule = require('node-schedule')

class JobManager {
  constructor() {
    this.jobs = {} // Store jobs with client IDs as keys
  }

  scheduleJob(clientId, cronSchedule, jobFunction) {
    // If a job with the same client ID exists, cancel it
    if (this.jobs[clientId]) {
      this.jobs[clientId].cancel()
    }

    // Schedule the new job
    const job = schedule.scheduleJob(cronSchedule, jobFunction)
    this.jobs[clientId] = job

    console.log(`Scheduled job for client ID: ${clientId}`)
    return job
  }

  cancelJob(clientId) {
    if (this.jobs[clientId]) {
      this.jobs[clientId].cancel()
      delete this.jobs[clientId]
      console.log(`Cancelled job for client ID: ${clientId}`)
      return true
    }
    console.log(`No job found for client ID: ${clientId}`)
    return false
  }

  getJob(clientId) {
    return this.jobs[clientId]
  }
}

module.exports = new JobManager() // Export a single instance

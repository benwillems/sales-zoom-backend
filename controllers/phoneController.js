const { HttpError } = require('../errors/HttpError')
const { sendCall, processCall, receiveSms, generateNotesForCheckinId, testInBodyScan } = require('../services/phoneService')

exports.sendCall = async (req, res) => {
  const { phoneNumber } = req.body
  try {
    const callDetails = await sendCall(phoneNumber)
    return res.status(200).json({details: callDetails})
  } catch (error) {
    console.error('Error sending call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.processCall = async (req, res) => {
  const callId = req.params.callId
  try {
    const callDetails = await processCall(callId)
    return res.status(200).json({ details: callDetails })
  } catch (error) {
    console.error('Error sending call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.receiveSms = async (req, res) => {
  const { From, Body } = req.body
  const numMedia = req.body.NumMedia
  console.log("Number of media is: ", numMedia)
  let mediaUrl
  if (numMedia && parseInt(numMedia) > 0) {
    mediaUrl = req.body.MediaUrl0
  }
  
  console.log("Media Url: ", mediaUrl)
  try {
    const messageResponse = await receiveSms(From, Body, false, mediaUrl)
    return res.type('text/xml').status(200).send(messageResponse)
  } catch (error) {
    console.error('Error sending call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.generateNotesForCheckinId = async (req, res) => {
  const checkinId = req.params.checkinId
  try {
    await generateNotesForCheckinId(checkinId)
    return res.status(200).send('up')
  } catch (error) {
    console.error('Error sending call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.testInBodyScan = async (req, res) => {
  const { clientId, message, mediaUrl } = req.body
  try {
    await testInBodyScan(clientId, message, mediaUrl)
    return res.status(200).send('up')
  } catch (error) {
    console.error('Error sending call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

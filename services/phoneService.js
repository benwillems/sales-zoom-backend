const {
  callUser,
  getCall,
  sendSms,
  insertInbodyScanDetails
} = require('../utils/phoneUtils')
const {
  PrismaClient,
  CheckInSource,
  CheckInStatus,
  MessageType,
  MessageOwner,
} = require('@prisma/client')
const prisma = new PrismaClient()
const moment = require('moment-timezone')
const { MessagingResponse } = require('twilio').twiml
const { takeNextStepInConversation, transcriptToNotes, imageToNotes, generateTemplateFromGoal,
  imageToNotesClaude } = require('../utils/checkInUtils')
const { BadRequestError } = require("../errors/HttpError")

const sendCall = async (phoneNumber, clientId) => {
  let call = await callUser(phoneNumber)
  if (call.success) {
    processCall(call.callId, clientId)
  }
  return call
}

const processCall = async (callId, clientId) => {
  let callDetails = await getCall(callId)
  while (!callDetails.completed) {
    callDetails = await getCall(callId)
  }
  transcript = callDetails.concatenated_transcript
  const notes = await transcriptToNotes(transcript)
  const checkIn = await prisma.checkIn.create({
    data: {
      clientId: clientId,
      transcript: transcript,
      checkInSummary: notes.calorie_breakdown,
      source: CheckInSource.AI_AGENT_CALL,
    },
  })
  return checkIn
}

const receiveSms = async (phoneNumber, message, schedulerCall=false, mediaUrl=null) => { 
  const client = await prisma.client.findUnique({
    where: {
      phone: phoneNumber,
    },
  })
  if (!client) {
    throw new BadRequestError("Phone number not recognized")
  }

  if (!client.checkInEnabled) {
    return handleClientRegularMessage(mediaUrl, client.id, message)
  }
  const twiml = new MessagingResponse()
  let responseMessage = ''
  const currentDate = moment().tz(client.timeZone).format('YYYY-MM-DD')

  let checkIn = await prisma.checkIns.findFirst({
    where: {
      clientId: client.id,
      day: new Date(currentDate),
    },
  })

  if (!checkIn) {
    checkIn = await prisma.checkIns.create({
      data: {
        clientId: client.id,
        day: new Date(currentDate),
        source: CheckInSource.AI_AGENT_TEXT,
        status: CheckInStatus.IN_PROGRESS,
      },
    })
    if (!schedulerCall) {
      await prisma.client.update({
        where: { id: client.id },
        data: {
          checkInQuestionAsked: false,
        },
      })
    }
  }
  if (checkIn.status == CheckInStatus.SUCCEEDED) {
    twiml.message('Check in is complete')
    return twiml.toString()
  }

  let transcript = checkIn.transcript
  if (mediaUrl) {
    console.log("Processing image")
    let {imageNotesResponse, functionName} = await imageToNotesClaude(mediaUrl, message)
    if (functionName == 'illegibleImage') {
      responseMessage += imageNotesResponse.message
      responseMessage += '\n\n'
    } else if (functionName == 'inbodyScanDetails') {
      await insertInbodyScanDetails(client.id, imageNotesResponse)
      twiml.message('In body scan added!')
      return twiml.toString()
    } else if (functionName == 'illegibleImageOfInBodyScan') {
      twiml.message(imageNotesResponse.message)
      return twiml.toString()
    } else {
      transcript.push({
        role: 'user',
        content: { type: 'image', content: mediaUrl },
      })
      if (message && message != '') {
        transcript.push({
          role: 'user',
          content: { type: 'text', content: message },
        })
      }
      transcript.push({
        role: 'metadata_assistant',
        content: { type: 'text', content: imageNotesResponse },
      })
      await prisma.checkIns.update({
        where: { id: checkIn.id },
        data: {
          transcript: transcript,
        },
      })
      if (imageNotesResponse) {
        responseMessage += `You had a ${imageNotesResponse?.serving_size} of ${imageNotesResponse?.food} with calories: ${imageNotesResponse?.calorie_breakdown?.calories}, fat: ${imageNotesResponse?.calorie_breakdown?.fat} grams, protein: ${imageNotesResponse?.calorie_breakdown?.protein} grams and carbohydrates: ${imageNotesResponse?.calorie_breakdown?.calories} grams.`
        responseMessage += '\n\n'
      }
    }
  }
  if (message != "" && mediaUrl == null) {
    transcript.push({ role: 'user', content: {type: 'text', content: message} })
  }

  const checkInTemplate = await prisma.checkInTemplate.findFirst({
    where: { clientId: client.id }
  })
  let clientGoals = null
  if (checkInTemplate) {
    clientGoals = JSON.stringify(checkInTemplate.checkInTemplate)
  } else {
    const createCheckInTemplate = await generateTemplateFromGoal(client.checkInGoal)
    const addTemplate = await prisma.checkInTemplate.create({
      data: {
        checkInTemplate: createCheckInTemplate,
        clientId: client.id,
      },
    })
    clientGoals = createCheckInTemplate
  }

  if (client.checkInQuestionAsked || schedulerCall) {
    // Ask the ai to make the decision whether it should end the conversation or ask another question to the user
    let {result, shouldEndConversation} = await takeNextStepInConversation(
        clientGoals,
        transcript
      )
    // Ai should only decide to end the conversation if check in goal is reached
    if (shouldEndConversation) {
      const transcriptNotes = await transcriptToNotes(clientGoals, transcript)
      await prisma.checkIns.update({
        where: { id: checkIn.id },
        data: {
          status: CheckInStatus.SUCCEEDED,
          transcript: transcript,
          checkInSummary: transcriptNotes
        },
      })
      await prisma.client.update({
        where: { id: client.id},
        data: {
          checkInQuestionAsked: false
        }
      })
      twiml.message(result.end_message)
      return twiml.toString()
    } else {
      transcript.push({
        role: 'assistant',
        content: { type: 'text', content: result.question },
      })
      await prisma.checkIns.update({
        where: { id: checkIn.id },
        data: {
          transcript: transcript,
        },
      })
      if (schedulerCall) {
        console.log("Inside scheduler call")
        await prisma.client.update({
          where: { id: client.id },
          data: {
            checkInQuestionAsked: true,
          },
        })
        await sendSms(phoneNumber, result.question)
        twiml.message("")
        return twiml.toString()
      }
      responseMessage += result.question
      twiml.message(responseMessage)
      return twiml.toString()
      // Text the question when twilio is set up
    }
  } else {
    await prisma.checkIns.update({
      where: { id: checkIn.id },
      data: {
        transcript: transcript,
      },
    })
    if (responseMessage == '') {
      responseMessage = 'Thank you for logging your check-in'
    }
    twiml.message(responseMessage)
    return twiml.toString()
  }

  // Update the check in database and the transcription in the database
}

const generateNotesForCheckinId = async (checkinId) => {
  let checkIn = await prisma.checkIns.findFirst({
    where: {
      id: parseInt(checkinId),
    },
  })
  const client = await prisma.client.findUnique({
    where: {
      id: checkIn.clientId
    },
  })

  const checkInTemplate = await prisma.checkInTemplate.findFirst({
    where: { clientId: client.id },
  })

  let clientGoals = null
  if (checkInTemplate) {
    clientGoals = checkInTemplate.checkInTemplate
  } else {
    const createCheckInTemplate = await generateTemplateFromGoal(
      client.checkInGoal
    )
    const addTemplate = await prisma.checkInTemplate.create({
      data: {
        checkInTemplate: createCheckInTemplate,
        clientId: client.id,
      },
    })
    clientGoals = createCheckInTemplate
  }
  const transcriptNotes = await transcriptToNotes(
    clientGoals,
    checkIn.transcript
  )
  
  await prisma.checkIns.update({
    where: { id: checkIn.id },
    data: {
      status: CheckInStatus.SUCCEEDED,
      transcript: checkIn.transcript,
      checkInSummary: transcriptNotes,
    },
  })
}
// const processCall = async(callId) => {
//   const callDetails = await getCall(callId)
//   let transcript
//   if (callDetails.completed) {
//     transcript = callDetails.concatenated_transcript
//     return await transcriptToNotes(transcript)
//   }
//   return callDetails
// }

const testInBodyScan = async (clientId, message, mediaUrl) => {
  let responseMessage = ""
  if (mediaUrl) {
    console.log("Processing image")
    let {imageNotesResponse, functionName} = await imageToNotesClaude(mediaUrl, message)
    if (functionName == 'illegibleImage') {
      responseMessage += imageNotesResponse.message
      responseMessage += '\n\n'
    } else if (functionName == 'inbodyScanDetails') {
      await insertInbodyScanDetails(clientId, imageNotesResponse)
    } else if (functionName == 'illegibleImageOfInBodyScan') {
      console.log(imageNotesResponse.message)
    } else {
      console.log(JSON.stringify(imageNotesResponse))
    }
  }
}

const handleClientRegularMessage = async (mediaUrl, clientId, message) => {
  await prisma.messages.create({
    data: {
      clientId: clientId,
      message: message,
      messageOwner: MessageOwner.USER,
      messageType: mediaUrl ? MessageType.IMAGE : MessageType.TEXT,
      imageUrl: mediaUrl
    }
  })
  twiml.message('')
  return twiml.toString()
}

module.exports = {
  sendCall,
  processCall,
  receiveSms,
  generateNotesForCheckinId,
  testInBodyScan
}
const { OpenAI, toFile } = require('openai')
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
})
const tmp = require('tmp')
const ffmpeg = require('fluent-ffmpeg')
const PDFDocument = require('pdfkit')
const { BadRequestError } = require('../errors/HttpError')
const { AssemblyAI } = require('assemblyai')
const fetch = require('node-fetch')
const fs = require('fs')
const util = require('util')
const stream = require('stream')
const pipeline = util.promisify(stream.pipeline)
const { PrismaClient, AppointmentStatus } = require('@prisma/client');
const { app } = require('firebase-admin')
const prisma = new PrismaClient();
const AWS = require('aws-sdk');
const { type } = require('os')
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: 'us-west-2', // e.g., 'us-west-1'
});
const s3 = new AWS.S3();
const path = require('path')
const os = require('os')
// const {
//     generateNotesForAppointment,
// } = require('../utils/audioAppointmentUtils');

const {
  getSignedUrl,
  getFileFromS3,
  generateAppointmentPreSignedUrls,
  uploadBufferToS3,
  getPresignedUrl,
} = require('../utils/s3utils')
// const {
//     mergeAudioFiles,
//     extractSummaryFromAudioTranscript,
//     transcribeAudio,
//     processAudioFiles,
//     summaryListToBullet,
//     fillDefaults,
//     createTranscriptionPdf,
//     generateNotesForEmailFromAI,
//     renerateEmailFromAppointment,
//   } = require('../utils/audioAppointmentUtils')

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY,
})

function mergeAudioFiles(buffer1, buffer2) {
  return new Promise((resolve, reject) => {
    // Create temporary files for the audio buffers
    const tmpFile1 = tmp.fileSync({ postfix: '.mp3' })
    const tmpFile2 = tmp.fileSync({ postfix: '.mp3' })
    const mergedTmpFile = tmp.tmpNameSync({ postfix: '.mp3' })

    // Write the buffers to temporary files
    fs.writeFileSync(tmpFile1.name, buffer1)
    fs.writeFileSync(tmpFile2.name, buffer2)

    // Use ffmpeg to merge the audio files
    ffmpeg()
      .input(tmpFile1.name)
      .input(tmpFile2.name)
      .on('error', err => {
        console.error('An error occurred: ' + err.message)
        // Clean up temp files
        tmpFile1.removeCallback()
        tmpFile2.removeCallback()
        reject(err)
      })
      .on('end', () => {
        console.log('Merging finished!')

        // Read the merged file into a buffer
        fs.readFile(mergedTmpFile, (err, mergedBuffer) => {
          if (err) {
            reject(err)
            return
          }

          // Clean up temp files
          tmpFile1.removeCallback()
          tmpFile2.removeCallback()
          fs.unlinkSync(mergedTmpFile) // Delete the merged temporary file

          resolve(mergedBuffer) // Resolve the promise with the merged buffer
        })
      })
      .mergeToFile(mergedTmpFile, '/tmp/')
  })
}

async function extractSummaryFromAudioTranscript(
  transcriptText,
  template,
  client,
  isMultiMembers = false,
  talkingPoint
) {
  console.log("Summary of: " + transcriptText)
  if (isMultiMembers) {
    return await extractSummaryFromAudioTranscriptMultiMembers(
      transcriptText,
      template
    )
  }
  try {
    const clientDetails = [
      client?.age ? `Age: ${client?.age}` : '',
      client?.gender ? `Gender: ${client?.gender}` : '',
      client?.breed ? `Breed: ${client?.breed}` : '',
      client?.species ? `Species: ${client?.species}` : '',
    ]
      .filter(detail => detail)
      .join(', ')

    const userContent =
      `The call transcript is ${transcriptText} for client ${client?.name}` +
      (clientDetails ? ` (${clientDetails})` : '' + `this is the talking points ${JSON.stringify(talkingPoint)}`)

    const scorePointsJson = {
      type: 'object',
      description: `The nutritionist's overall effectiveness score based on their discussion of key topics.`,
      properties: {
        score: {
          type: 'object',
          description:
            "The nutritionist's overall effectiveness score based on their discussion of key topics.",
          properties: {
            total: {
              type: 'number',
              description:
                'The total number of talking points assigned for discussion.',
            },
            score: {
              type: 'number',
              description:
                'The overall effectiveness score for the nutritionist, based on how well they discussed the talking points.',
            }
          }
        },
        points: {
          type: 'array',
          description:
            'A list of talking points discussed by the nutritionist, each containing a score and a summary of how well it was covered.',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'The name of the talking point.'
              },
              score: {
                type: 'object',
                description:
                  'Score for this specific talking point: 1 for thoroughly covered, 0.5 for partially covered, and 0 for not addressed.',
                properties: {
                  total: {
                    type: 'number',
                    description:
                      'Maximum score for this individual talking point (always 1).'
                  },
                  scored: {
                    type: 'number',
                    description:
                      'The actual score assigned based on how well the nutritionist covered this topic.'
                  }
                }
              },
              pointMissed: {
                type: 'string',
                description:
                  'A brief evaluation of how the nutritionist handled this topic. If the score is below 1, describe what was missing, such as lack of detail, poor explanation, or failure to engage the client.'
              }
            },
            required: ['name', 'score', 'pointMissed']
          }
        },
      },
      required: ['score', 'points']
    };

    // function mergeTemplateAndScorePoints(template, scorePoints) {
    //   const mergedTemplate = JSON.parse(JSON.stringify(template));

    //   if (!mergedTemplate.parameters || !mergedTemplate.parameters.properties) {
    //     throw new Error("Template JSON must have 'parameters.properties'");
    //   }

    //   mergedTemplate.parameters.properties[ "talkingPointScore"] = scorePointsJson;

    //   return mergedTemplate;
    // }

    template.parameters.properties["talkingPointScore"] = scorePointsJson;

    template.parameters["required"] = Object.keys(template.parameters.properties);

    completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      seed: 123,
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. You have two jobs. You are given raw audio transcript of a single appointment between a nutrionist and their client and convert it into the given notes format. For each section keep the statements to concise bullet points with all details included. The appointment might just be a general conversation. TRY TO FILL IN AS MANY DETAILS AS POSSIBLE INTO THE GIVEN FORMAT. DO NOT INCLUDE ANY INTERPRETATION OF YOUR OWN. Use term member to refer to the client. DO NOT USE THE WORD 'DEFAULT' OR 'NONE' IN YOUR RESPONSE. If there is no mention of a section leave the section empty. DO NOT USE ANY FILLER WORDS LIKE NORMAL IF NO OBSERVATION ABOUT THE SECTION IS MADE.
          
          Second job involves providing a comprehensive evaluation of the nutritionist if they discussed the talking points given to them during their appointment in the transcript. In this role, the primary objective is to generate a quantitative score that reflects the nutritionist's overall performance.
    
    
          **Scoring Criteria for Nutritionist Performance:**
          - **1:** The nutritionist thoroughly covered the talking point, provided clear explanations, and engaged the client effectively.
          - **0.5:** The nutritionist mentioned the point but did not fully explain it or missed critical details.
          - **0:** The nutritionist did not address the talking point at all.
    
          The final effectiveness score is calculated as the sum of individual scores divided by the total number of talking points. This helps track improvements in the nutritionist’s communication and educational effectiveness. TRY YOUR BEST TO FILL IN THE GIVEN FORMAT. ONLY CHOOSE ERROR SCENARIO IF THERE IS NO CONVERSATION / TRANSCRIPT`,
        },
        { role: 'user', content: userContent },
      ],
      functions: [
        template,
        {
          name: 'errorWhenMissingTranscript',
          description:
            'Select this function when no meaninful transcript was provided. Provide a brief 20 character sentence message on why transcript was not sufficient.',
          parameters: {
            type: 'object',
            properties: {
              resolution: {
                type: 'string',
                description:
                  'Contains a brief and concise one sentence explanation to help guide the user on why the transcript was not sufficient. If you say transcript was not sufficient then summarize what was there in the transcript',
              },
            },
          },
        },
      ],
      function_call: 'auto',
    })
  } catch (error) {
    console.log('AI error')
    console.log(error)
    console.log(error.response)
    throw new Error(error)
  }
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  let functionName = completion.choices[0].message.function_call.name
  if (functionName == 'errorWhenMissingTranscript') {
    throw new BadRequestError(result.resolution)
  }
  return result
}

async function extractSummaryFromAudioTranscriptMultiMembers(
  transcriptText,
  template
) {
  try {
    const userContent = `The call transcript is ${transcriptText} for multiple clients with the nutritionist.`
    const final_template = {
      name: 'nutritionOnBoardingCallTranscriptToStructureMultipleClients',
      description:
        'Convert the appointment of multiple clients (couple, gym partners) with nutrition coach in the audio transcript to structured notes of concise and clear bullet points with all details included. Segregate them with each speaker being a client and one of them is nutrition coach.',
      parameters: {
        type: 'object',
        properties: {
          clients: {
            type: 'array',
            description:
              'Each item in the array represents a unique client (speaker) and their visit notes for the nutrition coach.',
            items: {
              type: 'object',
              properties: {
                visit: template.parameters.properties.visit,
              },
            },
          },
        },
      },
    }

    completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0,
      seed: 123,
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. Your job is to take a raw audio transcript of a single appointment between a nutrionist and multiple clients (couple, friends, gymn buddies) and convert it into the given format and sort it out based on the speaker (client). If there are notes you do not know which client they belong to add it for every client. For each section keep the statements to concise bullet points with all details included. DO NOT INCLUDE ANY INTERPRETATION OF YOUR OWN. Use term member to refer to the client. DO NOT USE THE WORD 'DEFAULT' OR 'NONE' IN YOUR RESPONSE. If there is no mention of a section leave the section empty. DO NOT USE ANY FILLER WORDS LIKE NORMAL IF NO OBSERVATION ABOUT THE SECTION IS MADE.`,
        },
        { role: 'user', content: userContent },
      ],
      functions: [
        final_template,
        {
          name: 'errorWhenMissingTranscript',
          description:
            'Select this function when no meaninful transcript was provided. Provide a brief 20 character sentence message on why transcript was not sufficient.',
          parameters: {
            type: 'object',
            properties: {
              resolution: {
                type: 'string',
                description:
                  'Contains a brief and concise one sentence explanation to help guide the user on why the transcript was not sufficient',
              },
            },
          },
        },
      ],
      function_call: 'auto',
    })
  } catch (error) {
    console.log(error)
    console.log(error.response)
    throw new Error(error)
  }
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  let functionName = completion.choices[0].message.function_call.name
  if (functionName == 'errorWhenMissingTranscript') {
    throw new BadRequestError(result.resolution)
  }
  return result
}

async function processAudioFiles(urls, isMultiMembers = false) {
  // Map each URL to a promise of fetching, transcribing, and deleting
  console.log("Processing audio file")
  const transcriptionPromises = urls.map(async (urlObject, index) => {
    // Assuming URL is directly accessible for fetch
    const response = await fetch(urlObject.url)

    if (!response.ok)
      throw new NotFoundError(`Failed to fetch: ${response.statusText}`)

    // Download the audio file
    const tempFilePath = `./temp_audio_${index}.mp3`
    await pipeline(response.body, fs.createWriteStream(tempFilePath))

    // Transcribe audio
    const transcriptionResult = await transcribeAudio(
      fs.readFileSync(tempFilePath),
      urlObject.url,
      isMultiMembers
    ) // Adjust as needed

    // Delete the temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath)
    }

    return transcriptionResult.text
  })

  // Wait for all transcriptions to complete
  const transcriptions = await Promise.all(transcriptionPromises)

  // Combine all texts
  const combinedText = transcriptions.join(' ')

  return combinedText
}

async function transcribeAudio(
  audioFile,
  presignedUrl,
  isMultiMembers = false
) {
  console.log("Transcribing audio")
  let transcription
  try {
    transcription = await transcribeAudioAssembly(presignedUrl, isMultiMembers)
    console.log('Transcription is: ', transcription.text)
  } catch (error) {
    console.log('Found error in assembly: ', error)
    if (isMultiMembers) {
      throw new Error(
        'Multi members assembly transcription failed and should not go to openai'
      )
    }
    transcription = await transcribeAudioOpenAi(audioFile)
  }
  return transcription
}

async function transcribeAudioOpenAi(audioFile) {
  try {
    transcription = await openai.audio.transcriptions.create({
      file: await toFile(audioFile, 'audio-file.mp3'),
      model: 'whisper-1',
    })
    console.log('Transcription is: ', transcription.text)
    return transcription
  } catch (error) {
    const msg = 'Error from transcribing audio is: '
    console.log('Error from transcribing audio is: ', error)
    console.log('Error from transcribing audio is: ', error.response)
    throw new Error(error)
  }
}

async function transcribeAudioAssembly(audio_url, speaker_labels = false) {
  try {
    console.log("Audio url: ", audio_url)
    const data = {
      audio_url: audio_url,
      language_detection: true,
      speaker_labels: speaker_labels,
    }
    let transcript = await client.transcripts.create(data)
    console.log("Transcription assembly response: ", transcript)
    if (transcript.status != 'completed') {
      console.log(
        'Assembly transcription not completed with status',
        transcript.status
      )
      throw new Error('Assembly transcription not completed')
    }
    if (speaker_labels && transcript.utterances) {
      // Initialize an empty string to hold the concatenated transcript
      let fullTranscript = ''

      // Concatenate each utterance into the fullTranscript string
      for (let utterance of transcript.utterances) {
        fullTranscript += `Speaker ${utterance.speaker}: ${utterance.text}\n`
      }

      // Assign the full concatenated transcript to a property for return
      transcript.text = fullTranscript
    }
    return transcript
  } catch (error) {
    console.log('Transcription failed with error: ', error)
    throw new Error(error)
  }
}

function createTranscriptionPdf(fileName, text) {
  const doc = new PDFDocument()
  const stream = fs.createWriteStream(fileName)
  doc.pipe(stream)
  doc.fontSize(12).text(text)
  doc.end()

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(fileName))
    stream.on('error', reject)
  })
}

// function summaryListToBullet(summary, order) {
//   if (
//     typeof summary.nutrition_targets == 'object' &&
//     Object.keys(summary.nutrition_targets).length > 0
//   ) {
//     const nutrition_targets = order.nutrition_targets
//       ? order.nutrition_targets
//       : []
//     summary.nutrition_targets = processObjectProperties(
//       summary.nutrition_targets,
//       nutrition_targets
//     )
//   }

//   if (
//     typeof summary.notes == 'object' &&
//     Object.keys(summary.notes).length > 0
//   ) {
//     const notes = order.notes ? order.notes : []
//     summary.notes = processObjectProperties(summary.notes, notes)
//   }

//   if (summary.wins && Array.isArray(summary.wins) && summary.wins.length > 0) {
//     summary.wins = listToBulletPoints(summary.wins)
//   }
//   if (
//     summary.obstacles &&
//     Array.isArray(summary.obstacles) &&
//     summary.obstacles.length > 0
//   ) {
//     summary.obstacles = listToBulletPoints(summary.obstacles)
//   }
//   if (
//     summary.topics_to_discuss &&
//     Array.isArray(summary.topics_to_discuss) &&
//     summary.topics_to_discuss.length > 0
//   ) {
//     summary.topics_to_discuss = listToBulletPoints(summary.topics_to_discuss)
//   }
//   if (
//     summary.last_check_in_call_report &&
//     Array.isArray(summary.last_check_in_call_report) &&
//     summary.last_check_in_call_report.length > 0
//   ) {
//     summary.last_check_in_call_report = listToBulletPoints(
//       summary.last_check_in_call_report
//     )
//   }
//   if (
//     summary.recap_or_homework &&
//     Array.isArray(summary.recap_or_homework) &&
//     summary.recap_or_homework.length > 0
//   ) {
//     summary.recap_or_homework = listToBulletPoints(summary.recap_or_homework)
//   }

//   return summary
// }

function summaryListToBullet(summary, order) {
  function processProperty(property, orderProperty) {
    if (Array.isArray(property)) {
      return listToBulletPoints(property)
    } else if (typeof property === 'object' && property !== null) {
      return processObjectProperties(property, orderProperty || [])
    }
    return property
  }

  const processedSummary = {}

  for (const key in summary) {
    if (summary.hasOwnProperty(key)) {
      const property = summary[key]
      const orderProperty = order && order[key]
      processedSummary[key] = processProperty(property, orderProperty)
    }
  }

  return processedSummary
}

function processObjectProperties(obj, order) {
  const processedObj = {}

  for (const key of order) {
    if (obj.hasOwnProperty(key)) {
      processedObj[key] = obj[key]
    }
  }

  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !order.includes(key)) {
      processedObj[key] = obj[key]
    }
  }

  return processedObj
}

// function listToBulletPoints(list) {
//   return list.map((item, index) => `${index + 1}. ${item}`)
// }

function processObjectProperties(objectProperties, order) {
  let formattedProperties = ''
  const formatKey = key => {
    if (key === 'vdcs') return 'V/D/C/S'
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  let keysToProcess = Object.keys(objectProperties)

  // If section exists in the order dictionary, use the specified order,
  // otherwise process keys as they are
  if (order.length > 0) {
    keysToProcess = order.filter(key => key in objectProperties)
  }

  for (let key of keysToProcess) {
    const property = objectProperties[key]
    const formattedKey = formatKey(key)

    if (Array.isArray(property) && property.length > 0) {
      formattedProperties +=
        `${formattedKey}:\n` + listToBulletPoints(property) + '\n\n'
    } else if (typeof property === 'string' && property.trim() !== '') {
      formattedProperties += `${formattedKey}: ${property}\n\n`
    }
  }

  return formattedProperties.trim() + '\n'
}

function listToBulletPoints(list) {
  // Map each item in the list to a string with a bullet point and a space at the beginning
  const bulletPointList = list.map(item => `- ${item}`)

  // Join all the items into a single string, with each item on a new line
  return bulletPointList.join('\n')
}

function physicalExamDictToString(physicalExam) {
  let result = ''
  for (const [key, value] of Object.entries(physicalExam)) {
    result += `${key.replace(/_/g, ' ')}: ${value}\n`
  }
  return result.trim() // Trim the trailing newline character
}

function fillDefaults(section, defaults) {
  for (const key in defaults) {
    if (!(key in section) || section[key] == '') {
      section[key] = defaults[key]
    }
  }
  return section
}

async function generateNotesForEmailFromAI(
  appointmentNotes,
  client
  // nutrionist
) {
  try {
    const clientDetails = [client?.age ? `Age: ${client?.age}` : '']
      .filter(detail => detail)
      .join(', ')

    // const nutrionistDetails = [
    //   nutrionist?.name ? `nutrionistsName: ${nutrionist?.name}` : '',
    //   nutrionist?.organization?.name
    //     ? `nutrionistsOrgName: ${nutrionist?.organization?.name}`
    //     : '',
    //   nutrionist?.organization?.address
    //     ? `nutrionistsAddress: ${nutrionist?.organization?.address}`
    //     : '',
    //   nutrionist?.organization?.phone
    //     ? `nutrionistsPhone: ${nutrionist?.organization?.phone}`
    //     : '',
    // ]
    //   .filter(detail => detail)
    //   .join(', ')

    const userContent =
      `The appointment notes ${appointmentNotes} for client ${client?.name}` +
      (clientDetails ? ` (${clientDetails})` : '')
    // (nutrionistDetails ? ` (${nutrionistDetails})` : '')

    completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. Your job is to take the notes for the individual appointment and generate a email that discusses the recap or homework section of the notes further and will be sent to the client, please ensure the email formed is professional, and friendly. Always start the email by saying "Hello {client.name}," I have included the appointment notes. Only return the email response to send to the client and do not include a subject line item in the response.`,
        },
        { role: 'user', content: userContent },
      ],
    })
  } catch (error) {
    console.log(error)
    console.log(error.response)
    throw new Error(error)
  }
  result = completion.choices[0].message.content
  return result
}

async function renerateEmailFromAppointment(
  selectedEmailBodyJson,
  howToChangeEmailJson
) {
  try {
    const selectedEmailBody = JSON.parse(selectedEmailBodyJson)
    const howToChangeEmail = JSON.parse(howToChangeEmailJson)

    const userContent = `Selected section to update: "${selectedEmailBody}". Instructions to update the selected section: "${howToChangeEmail}"`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'system',
          content: `I need you to update the selected section using the instructions that have been given to you. Only return the updated section and do not include any quotation marks.`,
        },
        { role: 'user', content: userContent },
      ],
    })

    const result = completion.choices[0].message.content
    return result
  } catch (error) {
    console.log(error)
    console.log(error.response)
    throw new Error(error)
  }
}

function parseBoolean(value) {
  if (typeof value === 'string') {
    switch (value.toLowerCase().trim()) {
      case 'true':
      case 'yes':
      case '1':
        return true
      case 'false':
      case 'no':
      case '0':
        return false
      default:
        return Boolean(value)
    }
  }
  return Boolean(value)
}

async function generateNotesForAppointment({ appointment, bucketName }) {
  try {
    const presignedUrls = await generateAppointmentPreSignedUrls(
      appointment.id,
      appointment.isMultiMembers
    );
    
    const transcription = await processAudioFiles(presignedUrls);
    console.log('Finished transcription');
    console.log('Transcription: ' + transcription);
    const timestamp = Date.now();
    const key = `transcripts/${appointment.id}/${timestamp}.txt`;
    const result = await s3
      .upload({
        Bucket: bucketName,
        Key: key,
        Body: transcription,
      })
      .promise();
    console.log('Transcript Upload finished');
    await prisma.appointment.update({
      where: { id: parseInt(appointment.id) },
      data: {
        recordingUrl: key,
        status: AppointmentStatus.GENERATING_NOTES,
      },
    });
    console.log("Template id: ", appointment.templateId)
    console.log("Appointment: ", appointment)
    const template = await prisma.template.findUnique({
      where: {
        id: parseInt(appointment.templateId),
      },
    });
    const notesTemplate = template.notesTemplate;

    const defaultsForNotes = notesTemplate.defaults;
    const notesOrder = notesTemplate.order ? notesTemplate.order : [];

    delete notesTemplate.defaults;
    delete notesTemplate.order;

    let totalSummary = await extractSummaryFromAudioTranscript(
      transcription,
      notesTemplate,
      appointment.client,
      appointment.isMultiMembers,
      appointment.talkingPoints
    );


    const totalScore = totalSummary?.talkingPointScore?.score?.total;
    const obtainedScore = totalSummary?.talkingPointScore?.score?.score;
    const talkingPointScore = totalSummary?.talkingPointScore;

    function removeTalkingPointScore(data) {
      let jsonData = typeof data === "string" ? JSON.parse(data) : data;
      if (jsonData?.talkingPointScore) {
        delete jsonData.talkingPointScore;
      }
      return jsonData;
    }

    summary = removeTalkingPointScore(totalSummary);


    console.log('Notes Created from AI', summary);
    if (defaultsForNotes && defaultsForNotes.objective) {
      let summaryWithDefaults = fillDefaults(
        summary.visit.objective,
        defaultsForNotes.objective
      );
      summary.visit.objective = summaryWithDefaults;
    }

    if (summary?.visit?.calorie_goal_breakdown) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          calorieGoalBreakdown: summary.visit.calorie_goal_breakdown,
        },
      });
    }
    if (summary?.visit?.goals && Array.isArray(summary.visit.goals)) {
      await prisma.client.update({
        where: { id: appointment.clientId },
        data: {
          goals: summary.visit.goals,
        },
      });
    }
    let status;
    let notes;
    if (appointment.isMultiMembers) {
      notes = summary.clients.map(client => {
        return { ...summaryListToBullet(client.visit, notesOrder) };
      });
      status = AppointmentStatus.SUCCEEDED_MULTI;
    } else {
      notes = summaryListToBullet(summary.visit, notesOrder);
      status = AppointmentStatus.SUCCEEDED;
      // sendEmail(summary.visit, client, user)
    }
    const finalAppointment = await prisma.appointment.update({
      where: { id: parseInt(appointment.id) },
      data: {
        notes: notes,
        status: status,
        templateId: parseInt(appointment.templateId),
        totalScore: parseFloat(totalScore),
        obtainedScore: parseFloat(obtainedScore),
        talkingPointScore: talkingPointScore
      },
      include: {
        client: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
      },
    });
    await prisma.client.update({
      where: { id: finalAppointment.clientId },
      data: {
        lastAppointmentDate: new Date(Date.now()),
      },
    });
  }
  catch (error) {
    await prisma.appointment.update({
      where: { id: parseInt(appointment.id) },
      data: {
        errorReason: error.message,
        status: AppointmentStatus.FAILED,
      },
    })
    throw error
  }

  return {
    appointment: appointment,
  };
}

module.exports = {
  mergeAudioFiles,
  processAudioFiles,
  transcribeAudio,
  fillDefaults,
  extractSummaryFromAudioTranscript,
  createTranscriptionPdf,
  summaryListToBullet,
  generateNotesForEmailFromAI,
  renerateEmailFromAppointment,
  parseBoolean,
  generateNotesForAppointment,
}

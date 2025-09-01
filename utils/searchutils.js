const { OpenAI } = require('openai')
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
})

async function answerQuestionsAboutRecords(records, client, userConversation) {
  try {
    const clientDetails = [
      client?.name ? `Name ${client?.name}` : '',
      client?.age ? `Age: ${client?.age}` : '',
      client?.gender ? `Gender: ${client?.gender}` : '',
      client?.breed ? `Breed: ${client?.breed}` : '',
      client?.species ? `Species: ${client?.species}` : '',
    ]
      .filter(detail => detail)
      .join(', ')

    let systemMessage = {
      role: 'system',
      content: `You are a nutrition assistant. Your job is to take a list of records of the client's visit history and using the history answer the question that the user has asked. DO NOT USE ANY OUTSIDE INFORMATION TO ANSWER THE QUESTION. Here are the records for client ${clientDetails} : ${records}.`,
    }
    userConversation.unshift(systemMessage)
    completion = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: userConversation,
      functions: [
        {
          name: 'findAnswerToQuestionFromRecords',
          description:
            'Answer user questions on the basis of the records by using as many details as possible with date of the appointment as source. If the records are empty or do not contain the answer just return a message saying that the information is not available.',
          parameters: {
            type: 'object',
            properties: {
              answer: {
                type: 'string',
                description:
                  "Answer to the user's question with sources describing which appointment (specifying appointment ids) is the answer coming from ONLY BASED ON THE PROVIDED RECORDS. DO NOT PUT THE APPOINTMENT ID IN THIS RESPONSE.",
              },
              source_appointment_ids: {
                type: 'array',
                description:
                  'list of appointment ids that were used as source to answer the question',
                items: {
                  type: 'integer',
                  description:
                    'Individual appointment ids that contributed to the answer of the question',
                },
              },
            },
          },
        }
      ],
      function_call: 'auto',
    })
  } catch (error) {
    console.log(error)
    console.log(error.response)
    throw new Error(error)
  }
  console.log(completion.choices[0].message.function_call.arguments)
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  return result
}

function formatNotes(notes) {
  let formattedText = ''

  for (const [key, value] of Object.entries(notes)) {
    formattedText += `${key.toUpperCase()}:\n`
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // Recursive call for nested objects
      formattedText += formatNotes(value) + '\n'
    } else {
      // Directly append the value if it's not an object
      formattedText += `${value}\n`
    }
    formattedText += '\n' // Add a newline for spacing between sections
  }

  return formattedText.trim() // Trim the final string to remove any trailing newlines
}

module.exports = { answerQuestionsAboutRecords, formatNotes }

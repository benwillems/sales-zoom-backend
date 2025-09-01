const { OpenAI } = require('openai')
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
})
const fs = require('fs')

async function extractSummaryFromPdf(pdfText) {
  try {
    completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-16k',
      messages: [
        {
          role: 'system',
          content: `You are a veterinary assistant. Your job is to take a raw report of multiple visits and convert it into the given format. For each section provide as much details as possible. INCLUDE ALL VISITS WITH DETAILS AND DATES. INCLUDE ALL TESTS INCLUDING ALLERGY PANELS AS SEPARATE VISITS.`,
        },
        { role: 'user', content: `The vet report is ${pdfText}` },
      ],
      functions: [
        {
          name: 'vetNotesToStructure',
          description:
            'Convert every veterinary visit and tests in the report to structured notes',
          parameters: {
            type: 'object',
            properties: {
              visits: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'string',
                      description:
                        'Summary of the visit in less than 50 characters',
                    },
                    date: {
                      type: 'string',
                      description: 'Date of the vet visit',
                    },
                    subjective: {
                      type: 'string',
                      description:
                        "the pet's main complaint or reason for seeking care.",
                    },
                    objective: {
                      type: 'string',
                      description:
                        "the clinical professional's observations or examinations.",
                    },
                    tests: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: {
                            type: 'string',
                            description: 'name of the test performed',
                          },
                          purpose: {
                            type: 'string',
                            description: 'what does the test evaluate',
                          },
                          insights: {
                            type: 'string',
                            description:
                              'What insights could be gathered from the test result? Include as much details as possible including numerical evidence if possible',
                          },
                        },
                      },
                    },
                    assessment: {
                      type: 'string',
                      description:
                        "doctor's diagnosis of the condition with reasoning.",
                    },
                    plan: {
                      type: 'object',
                      properties: {
                        treatment: {
                          type: 'string',
                          description:
                            'suggested or discussed treatment, as it relates to the reason for seeking care.',
                        },
                        medicines: {
                          type: 'string',
                          description:
                            'Any medicines prescribed with dosage information for the current treatment plan. Do not include previous medicines the patient might be prescribed.',
                        },
                      },
                    },
                    vaccinations: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: {
                            type: 'string',
                            description:
                              'name of vaccination applied. Should only be a vaccination. Do not include examinations, treatments or medicines here.',
                          },
                          date: {
                            type: 'string',
                            description: 'date when vaccination applied',
                          },
                          nextDoseDate: {
                            type: 'string',
                            description:
                              'Date when the next dose should be applied',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      ],
      function_call: { name: 'vetNotesToStructure' },
    })
    console.log('end')
    console.log(completion)
    result = JSON.parse(completion.choices[0].message.function_call.arguments)
    console.log(result)
    return result
  } catch (error) {
    console.log(error)
    // console.error('Error calling openai', error);
    console.log(error.response)
  }
}

async function downloadAndProcessPDF(url, chunkSize, namespace) {
  // Define the path for the downloaded file
  const tempDir = path.join(__dirname, 'temp')
  const filePath = path.join(tempDir, url.split('?')[0].split('/').pop())

  // Make sure the temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir)
  }

  try {
    // Download the file using axios
    const response = await axios.get(url, {
      responseType: 'stream',
    })

    // Write the response to a local file
    const writer = fs.createWriteStream(filePath)
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', async () => {
        // Process the PDF after download
        await extractChunksFromPdf(url, filePath, chunkSize, namespace)

        // Delete the temporary PDF file after processing
        fs.unlinkSync(filePath)

        resolve()
      })
      writer.on('error', reject)
    })
  } catch (error) {
    console.error('Error downloading the PDF:', error)
  }
}

module.exports = { extractSummaryFromPdf, downloadAndProcessPDF }

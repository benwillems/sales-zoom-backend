const { OpenAI, toFile } = require('openai')
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
})
const { Buffer } = require('buffer')

const { PrismaClient, AppointmentStatus } = require('@prisma/client');
const { app } = require('firebase-admin');
const { error } = require('console');
const prisma = new PrismaClient()
const {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} = require('../errors/HttpError')

const takeNextStepInConversation = async (goal, transcript) => {
  try {
    console.log(
      `The goal of the check in is: ${goal} and the conversation so far is: ${JSON.stringify(transcript)}`
    )
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      seed: 123,
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. Your job is to collect all details about a daily check in from the nutrition client. You will be given a goal of a check in and the conversation that has happened between you and the client. You can choose to ask more questions towards the goal or end the conversation. Only ask about questions that have not been answered yet by the client in the provided conversation. Keep the questions concise and simple. Only ask questions about the goal that were not answered in the conversation before.`,
        },
        {
          role: 'user',
          content: `The goal of the check in is: ${goal} and the conversation so far is: ${JSON.stringify(
            transcript
          )}`,
        },
      ],
      functions: [
        {
          name: 'askFurtherQuestionForCheckInTowardsTheCheckInGoal',
          description:
            'Choose this function if all information desired in the goal is not met and more questions need to be asked from the client. Ask very specific questions about what is missing in the complete transcript about the goal. Make this conversational if something needs more digging feel free to ask more questions towards the goal.',
          parameters: {
            type: 'object',
            properties: {
              question: {
                type: 'string',
                description:
                  'Start the question by thanking them for providing information from the last message and ask one further questions towards the goal. Keep it conversational based on the conversation provided. Only ask 1 question at a time.',
              },
            },
          },
        },
        {
          name: 'endConversation',
          description:
            'Select this function when the goal for the check in has been met and now no more questions are needed',
          parameters: {
            type: 'object',
            properties: {
              end_message: {
                type: 'string',
                description:
                  'Contains a brief message to end the conversation until the next day.',
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
  console.log(completion.choices[0].message)
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  let functionName = completion.choices[0].message.function_call.name
  console.log(result)
  // if (functionName == 'errorWhenMissingTranscript') {
  //   throw new BadRequestError(result.resolution)
  // }
  return { result: result, shouldEndConversation: functionName == 'endConversation' }
}

const transcriptToNotes = async (goals, transcript) => {
  try {
    console.log(`Goals are: ${JSON.stringify(goals)}`)
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0,
      seed: 123,
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. Your job is to consolidate all details from the transcript of a daily check in from the nutrition client. You will be given a transcript of the check in and clients responses to other goals, your job is to generate the calorie information for given foods. Entries from metadata assistant are the nutrient contents from the food in the picture user inputted. Use every metadata assistant entry and the text right after it towards the total nutrition contents. For other foods mentioned in the transcript, generate nutrition content for every food item mentioned. If multiple food items are included in a meal combine calories from all of them to generate the nutrition content. If client does not specify what meal it belongs to just choose one from best judgement but calculate nutrition content for every meal. All goals are: ${JSON.stringify(goals)}`,
        },
        {
          role: 'user',
          content: `The transcript is: ${JSON.stringify(transcript)}`,
        },
      ],
      functions: [
        {
          name: 'transcriptToCheckInDetails',
          description:
            'Convert the transcript to the structure highlighted below.',
          parameters: {
            type: 'object',
            properties: {
              meals: {
                type: 'object',
                description: 'Calorie breakdown for all meals of the day',
                properties: {
                  breakfast: {
                    type: 'array',
                    description:
                      'Calorie breakdown of all items in breakfast only individually.',
                    items: {
                      type: 'object',
                      description:
                        'Each individual item mentioned in breakfast and its calories breakdown. Be exact calories with the number and do not give a range. Choose regular 1 person serving size unless mentioned otherwise.',
                      properties: {
                        food: {
                          type: 'string',
                          description: 'Name of the food item',
                        },
                        serving_size: {
                          type: 'string',
                          description:
                            'Serving size can be number of quantity or weight. Specify units.',
                        },
                        // imageOfFood: {
                        //   type: 'string',
                        //   description:
                        //     'Icon of the food item, provide the image url of the icon.',
                        // },
                        calorie_breakdown: {
                          type: 'object',
                          description:
                            'Breakdown of calories in the food item mentioned',
                          properties: {
                            calories: {
                              type: 'number',
                              description: 'Total calorie amount',
                            },
                            protein: {
                              type: 'number',
                              description:
                                'Amount of protein grams. Unit is grams',
                            },
                            carbohydrates: {
                              type: 'number',
                              description:
                                'Amount of carbohydrates grams. Unit is grams',
                            },
                            fat: {
                              type: 'number',
                              description: 'Amount of fat grams. Unit is grams',
                            },
                          },
                        },
                      },
                    },
                  },
                  lunch: {
                    type: 'array',
                    description:
                      'Calorie breakdown of all items in lunch only individually.',
                    items: {
                      type: 'object',
                      description:
                        'Each individual item mentioned in lunch and its calories breakdown. Be exact calories with the number and do not give a range. Choose regular 1 person serving size unless mentioned otherwise.',
                      properties: {
                        food: {
                          type: 'string',
                          description: 'Name of the food item',
                        },
                        serving_size: {
                          type: 'string',
                          description:
                            'Serving size can be number of quantity or weight. Specify units.',
                        },
                        // imageOfFood: {
                        //   type: 'string',
                        //   description:
                        //     'Icon of the food item, provide the image url of the icon.',
                        // },
                        calorie_breakdown: {
                          type: 'object',
                          description:
                            'Breakdown of calories in the food item mentioned',
                          properties: {
                            calories: {
                              type: 'number',
                              description: 'Total calorie amount',
                            },
                            protein: {
                              type: 'number',
                              description:
                                'Amount of protein grams. Unit is grams',
                            },
                            carbohydrates: {
                              type: 'number',
                              description:
                                'Amount of carbohydrates grams. Unit is grams',
                            },
                            fat: {
                              type: 'number',
                              description: 'Amount of fat grams. Unit is grams',
                            },
                          },
                        },
                      },
                    },
                  },
                  dinner: {
                    type: 'array',
                    description:
                      'Calorie breakdown of all items in dinner only individually.',
                    items: {
                      type: 'object',
                      description:
                        'Each individual item mentioned in dinner and its calories breakdown. Be exact calories with the number and do not give a range. Choose regular 1 person serving size unless mentioned otherwise.',
                      properties: {
                        food: {
                          type: 'string',
                          description: 'Name of the food item',
                        },
                        serving_size: {
                          type: 'string',
                          description:
                            'Serving size can be number of quantity or weight. Specify units.',
                        },
                        // imageOfFood: {
                        //   type: 'string',
                        //   description:
                        //     'Icon of the food item, provide the image url of the icon.',
                        // },
                        calorie_breakdown: {
                          type: 'object',
                          description:
                            'Breakdown of calories in the food item mentioned',
                          properties: {
                            calories: {
                              type: 'number',
                              description: 'Total calorie amount',
                            },
                            protein: {
                              type: 'number',
                              description:
                                'Amount of protein grams. Unit is grams',
                            },
                            carbohydrates: {
                              type: 'number',
                              description:
                                'Amount of carbohydrates grams. Unit is grams',
                            },
                            fat: {
                              type: 'number',
                              description: 'Amount of fat grams. Unit is grams',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
              answersTowardsOtherGoals: {
                type: 'array',
                description:
                  'List of goals nutrionist had set for the check in and the answer from the client for that question',
                items: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: 'label of the goal picked from the goals mentioned by the user. Use the same label mentioned in the goals sent by the user otherwise leave it empty.'
                    },
                    goal: {
                      type: 'string',
                      description:
                        'goal of the nutrionist that they wanted to find out about the clients day',
                    },
                    client_answer: {
                      type: 'string',
                      description:
                        'Clients answer to the goal of the nutrionist.',
                    },
                    quantitative_value: {
                      type: 'number',
                      description:
                        'Any quantitative value associated with clients answer that answers the goal. Do not include if this value does not exist.',
                    },
                    categorical_value: {
                      type: 'string',
                      description:
                        'Any categorical value associated with clients answer that answers the goal. Do not include if this value does not exist.',
                    },
                    qualitative_value: {
                      type: 'string',
                      description:
                        'Any qualitative value associated with clients answer towards the goal. Keep it concise, do not copy over the entire client answer, but none of the unique qualitative properties should be missed. Do not include if this value does not exist.',
                    },
                  },
                },
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
  console.log(completion.choices[0].message.function_call.arguments)
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  let functionName = completion.choices[0].message.function_call.name
  let totalMacros = {
    fat: 0,
    protein: 0,
    calories: 0,
    carbohydrates: 0,
    value: 0,
  }

  // Iterate over each meal and food item
  for (let meal in result?.meals) {
    result?.meals[meal].forEach(food => {
      const breakdown = food.calorie_breakdown
      totalMacros.fat += breakdown.fat
      totalMacros.protein += breakdown.protein
      totalMacros.calories += breakdown.calories
      totalMacros.carbohydrates += breakdown.carbohydrates
    })
  }

  // Add totalMacros to the data object
  result.value = totalMacros.calories
  result.totalMacros = totalMacros
  console.log(result)
  // if (functionName == 'errorWhenMissingTranscript') {
  //   throw new BadRequestError(result.resolution)
  // }
  return result
}

const imageToNotes = async (imageUrl, imageAssociatedText) => {
  try {
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. You will be given an image which could be either a food item or a label of its nutrition contents or a picture of an inbody scan. There will also be some text associated with the picture. Approximate the calories from the image. The image and the prompt is the only input available and do not ask any clarifying questions. If no approximation of nutrition content can be made or in body scan is not legible mark the image as illegible. For inbody scan only, If there are shadows on the image then reject it.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `The text that the user provided with about the image: ${imageAssociatedText}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
              },
            },
          ],
        },
      ],
      functions: [
        {
          name: 'imageToNutritionDetails',
          description:
            'Nutrition details about the food item in the image also taking into account any text the user has added about the image.',
          parameters: {
            type: 'object',
            properties: {
              food: {
                type: 'string',
                description: 'Name of the food item',
              },
              serving_size: {
                type: 'string',
                description:
                  'Serving size can be number of quantity or weight. Specify units.',
              },
              calorie_breakdown: {
                type: 'object',
                description: 'Breakdown of calories in the food item mentioned',
                properties: {
                  calories: {
                    type: 'number',
                    description: 'Total calorie amount',
                  },
                  protein: {
                    type: 'number',
                    description: 'Amount of protein grams. Unit is grams',
                  },
                  carbohydrates: {
                    type: 'number',
                    description: 'Amount of carbohydrates grams. Unit is grams',
                  },
                  fat: {
                    type: 'number',
                    description: 'Amount of fat grams. Unit is grams',
                  },
                },
              },
            },
          },
        },
        {
          name: 'inbodyScanDetails',
          description:
            'Details about the InBody scan. If there are shadows on the image then reject it.',
          parameters: {
            type: 'object',
            properties: {
              testDateAndTime: {
                type: 'string',
                format: 'date-time',
                description: 'Date and time of the test',
              },
              id: {
                type: 'string',
                description: 'ID of the scan',
              },
              height: {
                type: 'string',
                description: 'Height mentioned in the scan',
              },
              age: {
                type: 'number',
                description: 'Age mentioned in the scan',
              },
              gender: {
                type: 'string',
                description: 'Gender mentioned in the scan',
              },
              bodyCompositionAnalysis: {
                type: 'object',
                description:
                  'Details mentioned under Body Composition Analysis',
                properties: {
                  intracellularWater: {
                    type: 'number',
                    description: 'Intracellular water value (lb)',
                  },
                  extracellularWater: {
                    type: 'number',
                    description: 'Extracellular water value (lb)',
                  },
                  dryLeanMass: {
                    type: 'number',
                    description: 'Dry lean mass value (lb)',
                  },
                  bodyFatMass: {
                    type: 'number',
                    description: 'Body fat mass value (lb)',
                  },
                  totalBodyWater: {
                    type: 'number',
                    description: 'Total body water value (lb)',
                  },
                  leanBodyMass: {
                    type: 'number',
                    description: 'Lean body mass value (lb)',
                  },
                  weight: {
                    type: 'number',
                    description: 'Weight (lb)',
                  },
                },
              },
              muscleFatAnalysis: {
                type: 'object',
                description: 'Details mentioned under Muscle-Fat Analysis',
                properties: {
                  weight: {
                    type: 'number',
                    description: 'Weight (lb)',
                  },
                  SMM: {
                    type: 'number',
                    description: 'Skeletal Muscle Mass (lb)',
                  },
                  bodyFatMass: {
                    type: 'number',
                    description: 'Body fat mass (lb)',
                  },
                  confidence_score: {
                    type: 'number',
                    description:
                      'Confidence score of how accurate this value is from the image as a percentage',
                  },
                },
              },
              obesityAnalysis: {
                type: 'object',
                description: 'Details mentioned under Obesity Analysis',
                properties: {
                  BMI: {
                    type: 'number',
                    description: 'Body Mass Index (BMI)',
                  },
                  PBF: {
                    type: 'number',
                    description: 'Percent Body Fat (%)',
                  },
                },
              },
              segmentalLeanAnalysis: {
                type: 'object',
                description: 'Details mentioned under Segmental Lean Analysis',
                properties: {
                  rightArm: {
                    type: 'object',
                    description: 'Details of lean mass in the right arm',
                    properties: {
                      pounds: {
                        type: 'number',
                        description: 'Lean mass in the right arm (lb)',
                      },
                      percentage: {
                        type: 'number',
                        description:
                          'Percentage of lean mass compared to ideal weight',
                      },
                      confidence_score: {
                        type: 'number',
                        description:
                          'Confidence score of how accurate this value is from the image as a percentage',
                      },
                    },
                  },
                  leftArm: {
                    type: 'object',
                    description: 'Details of lean mass in the left arm',
                    properties: {
                      pounds: {
                        type: 'number',
                        description: 'Lean mass in the left arm (lb)',
                      },
                      percentage: {
                        type: 'number',
                        description:
                          'Percentage of lean mass compared to ideal weight',
                      },
                    },
                  },
                  trunk: {
                    type: 'object',
                    description: 'Details of lean mass in the trunk',
                    properties: {
                      pounds: {
                        type: 'number',
                        description: 'Lean mass in the trunk (lb)',
                      },
                      percentage: {
                        type: 'number',
                        description:
                          'Percentage of lean mass compared to ideal weight',
                      },
                    },
                  },
                  rightLeg: {
                    type: 'object',
                    description: 'Details of lean mass in the right leg',
                    properties: {
                      pounds: {
                        type: 'number',
                        description: 'Lean mass in the right leg (lb)',
                      },
                      percentage: {
                        type: 'number',
                        description:
                          'Percentage of lean mass compared to ideal weight',
                      },
                    },
                  },
                  leftLeg: {
                    type: 'object',
                    description: 'Details of lean mass in the left leg',
                    properties: {
                      pounds: {
                        type: 'number',
                        description: 'Lean mass in the left leg (lb)',
                      },
                      percentage: {
                        type: 'number',
                        description:
                          'Percentage of lean mass compared to ideal weight',
                      },
                    },
                  },
                },
              },
              visceralFatLevel: {
                type: 'number',
                description: 'Visceral fat level',
              },
              basalMetabolicRate: {
                type: 'number',
                description: 'Basal metabolic rate (kcal)',
              },
              ECW_TBWAnalysis: {
                type: 'object',
                description: 'Details mentioned under ECW/TBW Analysis',
                properties: {
                  ECW_TBW: {
                    type: 'number',
                    description: 'ECW/TBW ratio',
                  },
                },
              },
              bodyCompositionHistory: {
                type: 'array',
                description: 'Body composition history over time',
                items: {
                  type: 'object',
                  properties: {
                    date: {
                      type: 'string',
                      format: 'date',
                      description: 'Date of the measurement',
                    },
                    weight: {
                      type: 'number',
                      description: 'Weight (lb)',
                    },
                    SMM: {
                      type: 'number',
                      description: 'Skeletal Muscle Mass (lb)',
                    },
                    PBF: {
                      type: 'number',
                      description: 'Percent Body Fat (%)',
                    },
                    ECW_TBW: {
                      type: 'number',
                      description: 'ECW/TBW ratio',
                    },
                  },
                },
              },
            },
          },
        },
        {
          name: 'illegibleImageOfInBodyScan',
          description:
            'Choose this if image is of InBody scan but is missing data or image is illegible',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description:
                  'Contains a brief message to the user as to why the picture is illegible and how can they fix it and ask to retry',
              },
            },
          },
        },
        {
          name: 'illegibleImage',
          description:
            'Choose this if image does not contain food or nutrition contents of food',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description:
                  'Contains a brief message as to why the picture is illegible',
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
  console.log("Completion is: ", completion)
  console.log('Message is: ', completion.choices[0].message)
  console.log(completion.choices[0].message.function_call.arguments)
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  let functionName = completion.choices[0].message.function_call.name
  return { imageNotesResponse: result, functionName: functionName }
}

const generateTemplateFromGoal = async (checkInGoal, prevTemplate = null) => {
  try {
    completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are a nutrionist assistant. You will be given goals of a daily check in and the past template. For goals that are similar in the old template use the same labels in the new template so the goals can be linked. The expected response could be quantitative (for example 3 cups of water), categorical (for example consistent or fluctuated), qualitative (for example consistent energy levels), or involve an action item (for example if feeling low energy send recipes). Every little detail present in the goals of the check in should be included in the goal list.`,
        },
        {
          role: 'user',
          content: `Goals of the check in ${checkInGoal} and old template is ${JSON.stringify(
            prevTemplate
          )}.`,
        },
      ],
      functions: [
        {
          name: 'templateForCheckIn',
          description: 'New template for the check in',
          parameters: {
            type: 'object',
            description:
              'Generate template to convert transcript into check in. The template should have a goal and a label',
            properties: {
              goals: {
                type: 'array',
                description:
                  'List of goals and the labels associated with them based on the provided goals and previous template. Keep the label same for goals from the previous template.',
                items: {
                  type: 'object',
                  properties: {
                    goal: {
                      type: 'string',
                      description:
                        'goal of the nutrionist that they wanted to find out about the clients day.',
                    },
                    label: {
                      type: 'string',
                      description:
                        'label to identify this goal across templates. It should be one word.',
                    },
                    expected_response_type: {
                      type: 'string',
                      description:
                        'One of quantitative, categorical, qualitative or action',
                    },
                  },
                },
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
  console.log("Completion is: ", completion)
  console.log('Message is: ', completion.choices[0].message)
  console.log(completion.choices[0].message.function_call.arguments)
  result = JSON.parse(completion.choices[0].message.function_call.arguments)
  return result
}

function cleanUpPhoneNumber(phoneNumber) {
  // Remove all non-numeric characters
  let cleanedNumber = phoneNumber.replace(/\D/g, '')

  // If the cleaned number has 10 digits and doesn't start with +1, add +1
  if (cleanedNumber.length === 10) {
    cleanedNumber = '+1' + cleanedNumber
  } else if (cleanedNumber.length === 11 && cleanedNumber.startsWith('1')) {
    cleanedNumber = '+' + cleanedNumber
  } else if (cleanedNumber.length > 11) {
    // Handle cases where the number might already have a country code
    // Ensure it has a '+' prefix
    cleanedNumber = '+' + cleanedNumber
  }

  return cleanedNumber
}

const imageToNotesClaude = async (imageUrl, imageAssociatedText) => {
  // Function to convert image URL to base64
  const imageUrlToBase64 = async url => {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.toString('base64')
  }

  // Convert image URL to base64
  const imageBase64 = await imageUrlToBase64(imageUrl)

  // Prepare the Claude API request
  const claudeRequest = {
    model: 'claude-3-5-sonnet-20240620',
    max_tokens: 1024,
    system: `You are a nutrionist assistant. You will be given an image which could be either a food item or a label of its nutrition contents or a picture of an inbody scan. There will also be some text associated with the picture. Approximate the calories from the image. The image and the prompt is the only input available and do not ask any clarifying questions. If no approximation of nutrition content can be made or in body scan is not legible mark the image as illegible. For inbody scan only, If there are shadows on the image then reject it.`,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg', // Adjust this if the image type is different
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: `The text that the user provided about the image: ${imageAssociatedText}`,
          },
        ],
      },
    ],
    tools: [
      {
        name: 'imageToNutritionDetails',
        description:
          'Nutrition details about the food item in the image also taking into account any text the user has added about the image. Always provide the calorie breakdown. Approximate where needed based on serving size and food.',
        input_schema: {
          type: 'object',
          properties: {
            food: {
              type: 'string',
              description: 'Name of the food item',
            },
            serving_size: {
              type: 'string',
              description:
                'Serving size can be number of quantity or weight. Specify units.',
            },
            calorie_breakdown: {
              type: 'object',
              description: 'Breakdown of calories in the food item mentioned',
              properties: {
                calories: {
                  type: 'number',
                  description: 'Total calorie amount',
                },
                protein: {
                  type: 'number',
                  description: 'Amount of protein grams. Unit is grams',
                },
                carbohydrates: {
                  type: 'number',
                  description: 'Amount of carbohydrates grams. Unit is grams',
                },
                fat: {
                  type: 'number',
                  description: 'Amount of fat grams. Unit is grams',
                },
              },
            },
          },
        },
      },
      {
        name: 'inbodyScanDetails',
        description:
          'Details about the InBody scan. If there are shadows on the image then reject it.',
        input_schema: {
          type: 'object',
          properties: {
            testDateAndTime: {
              type: 'string',
              description: 'Date of the measurement in utc string',
            },
            id: {
              type: 'string',
              description: 'ID of the scan',
            },
            height: {
              type: 'string',
              description: 'Height mentioned in the scan',
            },
            age: {
              type: 'number',
              description: 'Age mentioned in the scan',
            },
            gender: {
              type: 'string',
              description: 'Gender mentioned in the scan',
            },
            bodyCompositionAnalysis: {
              type: 'object',
              description: 'Details mentioned under Body Composition Analysis',
              properties: {
                intracellularWater: {
                  type: 'number',
                  description: 'Intracellular water value (lb)',
                },
                extracellularWater: {
                  type: 'number',
                  description: 'Extracellular water value (lb)',
                },
                dryLeanMass: {
                  type: 'number',
                  description: 'Dry lean mass value (lb)',
                },
                bodyFatMass: {
                  type: 'number',
                  description: 'Body fat mass value (lb)',
                },
                totalBodyWater: {
                  type: 'number',
                  description: 'Total body water value (lb)',
                },
                leanBodyMass: {
                  type: 'number',
                  description: 'Lean body mass value (lb)',
                },
                weight: {
                  type: 'number',
                  description: 'Weight (lb)',
                },
              },
            },
            muscleFatAnalysis: {
              type: 'object',
              description: 'Details mentioned under Muscle-Fat Analysis',
              properties: {
                weight: {
                  type: 'number',
                  description: 'Weight (lb)',
                },
                SMM: {
                  type: 'number',
                  description: 'Skeletal Muscle Mass (lb)',
                },
                bodyFatMass: {
                  type: 'number',
                  description: 'Body fat mass (lb)',
                },
                confidence_score: {
                  type: 'number',
                  description:
                    'Confidence score of how accurate this value is from the image as a percentage',
                },
              },
            },
            obesityAnalysis: {
              type: 'object',
              description: 'Details mentioned under Obesity Analysis',
              properties: {
                BMI: {
                  type: 'number',
                  description: 'Body Mass Index (BMI)',
                },
                PBF: {
                  type: 'number',
                  description: 'Percent Body Fat (%)',
                },
              },
            },
            segmentalLeanAnalysis: {
              type: 'object',
              description: 'Details mentioned under Segmental Lean Analysis',
              properties: {
                rightArm: {
                  type: 'object',
                  description: 'Details of lean mass in the right arm',
                  properties: {
                    pounds: {
                      type: 'number',
                      description: 'Lean mass in the right arm (lb)',
                    },
                    percentage: {
                      type: 'number',
                      description:
                        'Percentage of lean mass compared to ideal weight',
                    },
                    confidence_score: {
                      type: 'number',
                      description:
                        'Confidence score of how accurate this value is from the image as a percentage',
                    },
                  },
                },
                leftArm: {
                  type: 'object',
                  description: 'Details of lean mass in the left arm',
                  properties: {
                    pounds: {
                      type: 'number',
                      description: 'Lean mass in the left arm (lb)',
                    },
                    percentage: {
                      type: 'number',
                      description:
                        'Percentage of lean mass compared to ideal weight',
                    },
                  },
                },
                trunk: {
                  type: 'object',
                  description: 'Details of lean mass in the trunk',
                  properties: {
                    pounds: {
                      type: 'number',
                      description: 'Lean mass in the trunk (lb)',
                    },
                    percentage: {
                      type: 'number',
                      description:
                        'Percentage of lean mass compared to ideal weight',
                    },
                  },
                },
                rightLeg: {
                  type: 'object',
                  description: 'Details of lean mass in the right leg',
                  properties: {
                    pounds: {
                      type: 'number',
                      description: 'Lean mass in the right leg (lb)',
                    },
                    percentage: {
                      type: 'number',
                      description:
                        'Percentage of lean mass compared to ideal weight',
                    },
                  },
                },
                leftLeg: {
                  type: 'object',
                  description: 'Details of lean mass in the left leg',
                  properties: {
                    pounds: {
                      type: 'number',
                      description: 'Lean mass in the left leg (lb)',
                    },
                    percentage: {
                      type: 'number',
                      description:
                        'Percentage of lean mass compared to ideal weight',
                    },
                  },
                },
              },
            },
            visceralFatLevel: {
              type: 'number',
              description: 'Visceral fat level',
            },
            basalMetabolicRate: {
              type: 'number',
              description: 'Basal metabolic rate (kcal)',
            },
            ECW_TBWAnalysis: {
              type: 'object',
              description: 'Details mentioned under ECW/TBW Analysis',
              properties: {
                ECW_TBW: {
                  type: 'number',
                  description: 'ECW/TBW ratio',
                },
              },
            },
            bodyCompositionHistory: {
              type: 'array',
              description: 'Body composition history over time',
              items: {
                type: 'object',
                properties: {
                  date: {
                    type: 'string',
                    description: 'Date of the measurement in utc string',
                  },
                  weight: {
                    type: 'number',
                    description: 'Weight (lb)',
                  },
                  SMM: {
                    type: 'number',
                    description: 'Skeletal Muscle Mass (lb)',
                  },
                  PBF: {
                    type: 'number',
                    description: 'Percent Body Fat (%)',
                  },
                  ECW_TBW: {
                    type: 'number',
                    description: 'ECW/TBW ratio',
                  },
                },
              },
            },
          },
        },
      },
      {
        name: 'illegibleImageOfInBodyScan',
        description:
          'Choose this if image is of InBody scan but is missing data or image is illegible',
        input_schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description:
                'Contains a brief message to the user as to why the picture is illegible and how can they fix it and ask to retry',
            },
          },
        },
      },
      {
        name: 'illegibleImage',
        description:
          'Choose this if image does not contain food or nutrition contents of food',
        input_schema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description:
                'Contains a brief message as to why the picture is illegible',
            },
          },
        },
      },
    ],
    tool_choice: { type: 'auto' },
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeRequest),
    })

    const completion = await response.json()
    console.log('Completion is: ', completion)
    console.log('Message is: ', completion.content[0])

    let result, functionName

    console.log(completion.content)
    for (content of completion.content) {
      console.log(content)
      if (content.type === 'tool_use') {
        functionName = content.name
        result = content.input
      }
    }

    return { imageNotesResponse: result, functionName: functionName }
  } catch (error) {
    console.log(error)
    throw new Error(error)
  }
}

const generateTalkingPoints = async ({
  clientDetails,
  appointmentNotes,
  goals,
  calorieGoalBreakdown,
}) => {

  console.log("start generateTalkingPoints")
  console.log(appointmentNotes)
  try {

    completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a wellness coach's assistant. Generate personalized script for client check-ins that foster connection for 30 minutes meeting, encourage open dialogue, and create actionable next steps in detail while maintaining a warm, supportive tone. ONLY USE PERSONAL DETAILS ABOUT THE CLIENT THAT ARE MENTIONED IN THE PREVIOUS APPOINTMENTS. IF NO PREVIOUS APPOINTMENTS ARE PRESENT KEEP THE TALKING POINTS GENERAL. The goal is to create a personalized script for the client broken down in the following sections : 
                1. Raport Building
                2. Agenda Setting
                3. Wins
                4. Challenges
                5. Temperature Check
                6. Mood Metrics
                7. Next Steps
                8. Encouragement & Closing`,
        },
        {
          role: 'user',
          content: `Client Details: ${JSON.stringify(
            clientDetails
          )}, Previous Notes: ${JSON.stringify(
            appointmentNotes
          )}, calorieGoalBreakdown ${JSON.stringify(
            calorieGoalBreakdown
          )}, goals ${JSON.stringify(goals)}`,
        },
      ],
      functions: [
        {
          name: 'generate_client_checkin_points',
          description:
            'Generate personalized talking points in details for a client check-in session. These talking points will be like a script for the coach to have a meaningful conversation with their client. Your job is to provide helpful thoughtful comments for the coach where you could also guide how the coach should think at places instead of providing the exact things to say.',
          parameters: {
            type: 'object',
            description:
              'Client-focused check-in structure with conversation prompts',
            properties: {
              talkingPoints: {
                type: 'object',
                properties: {
                  rapportBuilding: {
                    type: 'object',
                    description: 'Connecting Outside of Fitness & Nutrition',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Rapport Building - Connecting Outside of Fitness & Nutrition. Should always start with Rapport Building',
                      },
                      time: {
                        type: 'string',
                        description:
                          'Give the tentative time for this section between 3-5 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Personal connection prompts and discussion points for building rapport you can use. client’s name, personal life, hobbies, interests, etc. From the previous notes provided see if there are specific personal incidents that can be included here.
                        1. Warm Welcome:
                      - Start with a personalized greeting using client's name
                      - Express genuine interest in their well-being
                      - Ask about their week's highlights or challenges
                      - Example greeting: "Hi [Name], it's great to see you! How's your week been so far—any highlights or challenges you'd like to share?"`,
                      },
                    },
                  },
                  agendaSetting: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Agenda Setting - Aligning With Client Priorities. Should always start with Agenda Setting',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 3-5 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Aligning With Client Priorities. List key check-in areas, reference previous focus areas, open floor for client priorities to set the agenda for the call.
                        1. Acknowledge Successes:
                      - Highlight specific wins based on their updates or data
                      - Note positive patterns in their behavior
                      - Example: "You've been making great strides with [specific habit, activity, or outcome]. How are you feeling about that?"
      
                      2. Encourage Reflection:
                      - Guide self-recognition of progress
                      - Ask about areas of satisfaction
                      - Example questions:
                        * "What's been going well for you recently?"
                        * "What's felt easiest to stick with, or what are you most proud of?"
      
                      3. Affirm Their Efforts:
                      - Provide specific praise for consistency
                      - Example affirmation: "It's clear you've been putting in a lot of effort, and that consistency is paying off. Great work!"`,
                      },
                    },
                  },
                  wins: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Wins - Highlighting Progress. Should always start with Wins',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 5-7 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'Highlighting Progress. Ask about recent successes, reference metrics, guide reflection. Use past appointment notes to find wins.For example help the coach think by saying: Guide reflection by asking questions like. "Looking back at the past couple of weeks, what is something you feel really good about?(If they struggle, guide them.)',
                      },
                    },
                  },
                  challenges: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Challenges - Identifying & Exploring Struggles. Should always start with Challenges',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 7-10 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Identifying & Exploring Struggles. Open-ended questions about roadblocks and challenges.
                        
                      1. Explore Current Challenges:
                      - Use open-ended questions about barriers
                      - Investigate specific problem areas
                      - Example questions:
                        * "What's felt most challenging for you recently—whether it's with workouts, nutrition, or something else?"
                        * "Are there any areas where you feel things could be going better or feel easier?"
      
                      2. Empathy and Validation:
                      - Acknowledge their struggles
                      - Normalize challenges
                      - Example response: "That sounds like a tough spot to be in, and it's completely normal to face challenges. Let's figure out how we can make this feel more manageable."
      
                      3. Brainstorm Solutions:
                      - Engage in collaborative problem-solving
                      - Example prompt: "What do you think would make the biggest difference for you right now?"`,
                      },
                    },
                  },
                  temperatureCheck: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Temperature Check - Ensuring the Plan Feels Right. Should always start with Temperature Check',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 3-5 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                          'Ensuring the Plan Feels Right. Check program satisfaction and desired adjustments. You should give ways to the coach on how they can ask the client whether the plan sounds good in an empathetic way. Tell the coach to ask questions like Do you feel like we’re focusing on the right things, or is there an area you’d like to emphasize more?',
                      },
                    },
                  },
                  moodMetrics: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Mood Metrics - Connecting Behaviors to Results. Should always start with Mood Metrics',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 7-10 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Assessment of energy, sleep, stress and hunger levels on 1-10 scale. If you can find any specific instances then focus on those questions but tell the coach to ask questions like Evaluate Well-Being
      
                            Ask about specific areas to gain a full picture of their progress and health:
                            "How’s your mood been lately—feeling positive, or have there been ups and downs?"
                            "How’s your energy level throughout the day?"
                            "How’s your sleep—are you feeling rested most nights?"
                            "How’s your stress level—anything affecting your routine?"
                            "How are you feeling about your workout performance—are you seeing progress or facing any challenges?"
                            "How’s recovery going—any soreness or fatigue lingering?"
                            "How’s your digestion and meal satisfaction—are you feeling good with your current meals, or noticing hunger or discomfort?"
                            Summarize Their Feedback:
      
                            Reflect back on what they’ve shared to show you’re listening:
                            "Thanks for sharing that—it sounds like [summarize their key points]."`,
                      },
                    },
                  },
                  nextSteps: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Next Steps - Collaborating on Action Steps. Should always start with Next Steps',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 4-7 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Collaborating on Action Steps. Summarize insights and propose specific adjustments. Use the following strategies to give the coach an outline to follow in their appointment.
                        
                      1. Empower Client Decision-Making:
                      - Guide self-directed changes
                      - Example prompt: "If you could change one thing about your routine right now to make it feel easier or more effective, what would it be?"
      
                      2. Offer Structured Options:
                      - Present specific suggestions:
                        * Adjusting calorie intake or meal timing
                        * Adding variety to workouts
                        * Planning meals differently
                        * Incorporating more recovery strategies
                      - Example presentation: "Here are a few ideas we could explore together... Do any of these feel like a good fit for you?"
      
                      3. Create Action Plan:
                      - Collaborate on specific implementation
                      - Example: "Let's talk about how we can make that adjustment work for you in a way that feels realistic and sustainable."`,
                      },
                    },
                  },
                  encouragementAndClosing: {
                    type: 'object',
                    properties: {
                      title: {
                        type: 'string',
                        description:
                          'Brief title like Encouragement & Closing',
                      },
                      time: {
                        type: 'string',
                        description:
                          'give the tentative time for this section between 4-7 minutes in integer only',
                      },
                      points: {
                        type: 'array',
                        items: { type: 'string' },
                        description: `Personalized encouragement, recognition of efforts, and clear next steps. Give the coach a clear outline on how they can make it personal and motivate their client
                        1. Session Summary:
                      - Review key points and action items
                      - Example: "Based on what we talked about today, here's what we'll focus on moving forward: [list action items]. Does that feel good to you?"
      
                      2. Encouragement:
                      - Provide positive reinforcement
                      - Example: "You've been doing an amazing job staying consistent, and it's exciting to see the progress you're making. Let's keep building on that step by step."
      
                      3. Schedule Follow-Up:
                      - Confirm next meeting
                      - Offer support
                      - Example: "We'll check in again at the same time next week. If anything comes up before then, feel free to reach out—I'm here to support you!"
                     `,
                      },
                    },
                  },
                },
                // required: [
                //   rapportBuilding,
                //   agendaSetting,
                //   wins,
                //   challenges,
                //   temperatureCheck,
                //   moodMetrics,
                //   nextSteps,
                //   encouragementAndClosing,
                // ],
              },
            },
            // required: [talkingPoints],
          },
        },
      ],
      function_call: 'auto',
    })
  } catch (error) {
    console.log(error);
    console.log(error.response);
    throw new Error(error);
  }
  result = JSON.parse(completion.choices[0].message.function_call.arguments);





  orderedPoints = reorderTalkingPoints(result);
  return orderedPoints;
};

const appointmentTalkingPoints = async ({
  appointmentId,
}) => {
  const appointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    }
  });

  if (appointment.talkingPoints) {
    const correctOrder = reorderTalkingPoints(appointment.talkingPoints);
    return correctOrder;
  }
  throw new NotFoundError('Talking points not found for this appointment');
}

function reorderTalkingPoints(response) {
  const ordered = {};
  const correctOrder = [
    "rapportBuilding",
    "agendaSetting",
    "wins",
    "challenges",
    "temperatureCheck",
    "moodMetrics",
    "nextSteps",
    "encouragementAndClosing"
  ];
  for (const key of correctOrder) {
    if (response.talkingPoints[key]) {
      ordered[key] = response.talkingPoints[key];
    }
  }
  return { talkingPoints: ordered };
}

const newAppointmentTalkingPoints = async ({
  scheduledAppointment,
}) => {
  if (scheduledAppointment.talkingPoints) {
    return
  }
  const clientId = scheduledAppointment.clientId;

  const previousAppointments = await prisma.appointment.findFirst({
    where: {
      clientId: clientId,
      id: {
        not: scheduledAppointment.id
      },
    },
    orderBy: {
      scheduleStartAt: 'desc',
    },
  });
  console.log('Previous Appointments are: ', previousAppointments);

  if (previousAppointments) {
    if (previousAppointments.status === AppointmentStatus.SCHEDULED || previousAppointments.status === AppointmentStatus.NO_SHOW || previousAppointments.status === AppointmentStatus.USER_CANCELLED || previousAppointments.status === AppointmentStatus.USER_DELETED) {
      if (previousAppointments.talkingPoints != null && previousAppointments.talkingPoints !== undefined) {
        await prisma.appointment.update({
          where: {
            id: scheduledAppointment.id,
          },
          data: {
            talkingPoints: previousAppointments.talkingPoints,
          }
        })
        return;
      }
    }
  }

  const now = new Date();

  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      active: true,
    },
  })

  if (!client) {
    throw new NotFoundError('client not found for your organization')
  }


  const latestAppointment = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.SUCCEEDED,
      scheduleStartAt: {
        lte: now,
      },
      clientId: clientId
    },
    orderBy: {
      scheduleStartAt: 'desc',
    },
    take: 4,
  });

  let appointmentNotes = [];
  if (!latestAppointment || latestAppointment.length === 0) {
    appointmentNotes = ['No appointment found for this client'];
  } else {
    appointmentNotes = latestAppointment.map(apt => apt.notes).filter(notes => notes);
  }

  const goals = (client.goals && Object.keys(client.goals).length > 0)
    ? client.goals
    : 'No goals found for this client';

  const calorieGoalBreakdown = (client.calorieGoalBreakdown && Object.keys(client.calorieGoalBreakdown).length > 0)
    ? client.calorieGoalBreakdown
    : 'No calorie goal breakdown found for this client';

  const quections = await generateTalkingPoints({
    clientDetails: client,
    goals: goals,
    calorieGoalBreakdown: calorieGoalBreakdown,
    appointmentNotes: appointmentNotes,
  });
  console.log('Talking Points are: ', quections);

  const updateTalkingPoints = await prisma.appointment.update({
    where: {
      id: scheduledAppointment.id,
    },
    data: {
      talkingPoints: quections,
    }
  })

  if (!updateTalkingPoints) {
    throw new NotFoundError('Talking points not updated')
  }

}

module.exports = {
  takeNextStepInConversation,
  transcriptToNotes,
  imageToNotes,
  cleanUpPhoneNumber,
  generateTemplateFromGoal,
  imageToNotesClaude,
  generateTalkingPoints,
  appointmentTalkingPoints,
  newAppointmentTalkingPoints,
}

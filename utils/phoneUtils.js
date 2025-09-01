const { OpenAI, toFile } = require('openai')
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
})
const auth = process.env.BLAND_API_KEY
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const fromPhoneNumber = process.env.FROM_PHONE_NUMBER
const client = require('twilio')(accountSid, authToken)
const { PrismaClient, CheckInSource, CheckInStatus } = require('@prisma/client')
const prisma = new PrismaClient()

const callUser = async (phoneNumber, pathwayId, clientName, tags, webhook=`${process.env.BACKEND_URL}/leads/call/result`) => {
  const options = {
    method: 'POST',
    headers: {
      authorization: auth,
      'Content-Type': 'application/json',
      'encrypted_key': process.env.BLAND_TWILIO_ENCRYPTED_KEY,
    },
    body: JSON.stringify({
      phone_number: phoneNumber,
      voice: process.env.BLAND_VOICE,
      interruption_threshold: 150,
      max_duration: 5,
      voicemail_action: 'leave_message',
      voicemail_message:
        'Hi there! This is Sam, your friendly Sasquatch AI. Call me back so I can schedule a time for you to come meet our trainers at Sasquatch strength!',
      pathway_id: pathwayId,
      webhook: webhook,
      from: process.env.BLAND_FROM_PHONE_NUMBER,
      request_data: {
        name: clientName,
        tags: tags,
        now_pst: new Date().toLocaleString("en-US", {
                timeZone: "America/Los_Angeles"
              })
      },
    }),
  }

  const resp = await fetch('https://api.bland.ai/v1/calls', options)
  return await resp.json()
}

const getCall = async callId => {
  const options = { method: 'GET', headers: { authorization: auth } }
  const resp = await fetch(`https://api.bland.ai/v1/calls/${callId}`, options)
  return await resp.json()
}

const transcriptToNotes = async transcriptText => {
  {
    try {
      completion = await openai.chat.completions.create({
        model: 'gpt-4-1106-preview',
        temperature: 0,
        seed: 123,
        messages: [
          {
            role: 'system',
            content: `You are a nutrionist assistant. Your job is to take a raw audio transcript of a call between an ai assistant and their client describing what they ate for different meals and convert it into the given format of macro nutrients based on the format. If serving size is not mentioned assume a regular serving size for 1 person.`,
          },
          { role: 'user', content: `The transcript is: ${transcriptText}` },
        ],
        functions: [
          {
            name: 'generateMacroNutrientSummaryFromFood',
            description:
              'Use transcript from a check in with a user where they talked about what they had for their meals over the day and convert it into relevant macro nutrients for each food as mentioned in the template. If serving size is not mentioned assume a regular serving size for 1 person. Additionally for the lifestyle tip part of the template please try to increase motivation by providing a quote and and try to help the user better understand nutrition.',
            parameters: {
              type: 'object',
              properties: {
                calorie_breakdown: {
                  type: 'object',
                  description:
                    'Breakdown of micronutrient calories for the entire day',
                  properties: {
                    calories: {
                      type: 'string',
                      description: 'Total calorie amount consumed in the day',
                    },
                    protein: {
                      type: 'string',
                      description:
                        'Amount of protein grams consumed in the day. Unit is grams',
                    },
                    carbohydrates: {
                      type: 'string',
                      description:
                        'Amount of carbohydrates grams consumed in the day. Unit is grams',
                    },
                    fat: {
                      type: 'string',
                      description:
                        'Amount of fat grams consumed in the day. Unit is grams',
                    },
                  },
                },
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
                                description:
                                  'Amount of fat grams. Unit is grams',
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
                                description:
                                  'Amount of fat grams. Unit is grams',
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
                                description:
                                  'Amount of fat grams. Unit is grams',
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
                // recipe: {
                //   type: 'object',
                //   description:
                //     'Generate a meal if there was a craving mention in the transcript and find a recipe that is healthy and can easily be made from stratch to satisfy the mentioned craving. Instructions on how to cook the recipe, a list of ingredients found in the recipe, and provide nutrition facts about the recipe for 1 serving unless mentioned otherwise.',
                //   properties: {
                //     // imageForRecipe: {
                //     //   type: 'string',
                //     //   description:
                //     //     'Image url that will be used to display an image.',
                //     // },
                //     name: {
                //       type: 'string',
                //       description: 'Name of the recipe',
                //     },
                //     ingredient_list: {
                //       type: 'array',
                //       description:
                //         'Ingredient list contains the quantity of each item that is used in the recipe.',
                //       items: {
                //         type: 'object',
                //         description:
                //           'Provide the name and quantity of each item used in the recipe. Quanity of items is for 1 regular person unless mentioned otherwise.',
                //         properties: {
                //           name: {
                //             type: 'string',
                //             description: 'Name of the item',
                //           },
                //           quantity: {
                //             type: 'string',
                //             description:
                //               'Quanity of item measured in a variety of methods. Volume measurements include: Teaspoons (tsp), Tablespoons (tbsp), Fluid ounces (fl oz), Cups Pints (pt), Quarts (qt), Gallons (gal), Milliliters (ml), Liters (l). Weight measurements include: Ounces (oz), Pounds (lb), Grams (g), Kilograms (kg). Count indicates the number of items (e.g., 2 carrots, 3 eggs). Part descriptions are part of an item (e.g., half an onion, a quarter of a watermelon). Size descriptions are Small, medium, large (often used for fruits and vegetables, like a medium onion). Pinches and Dashes are A pinch (less than 1/8 of a teaspoon) and A dash (about 1/8 teaspoon). Handfuls are roughly the amount one can hold in a hand, often used for leafy greens or herbs. Packs are referring to the package quantities in which ingredients are sold (e.g., a pack of yeast). Scoops are using a standardized scoop size, often found in ice cream recipes. Sprigs, sticks and slices are units particular to certain foods like herbs (sprigs), butter (sticks), or fruit and bread (slices).',
                //           },
                //         },
                //       },
                //     },
                //     instructions: {
                //       type: 'array',
                //       description:
                //         'List instruction steps to create the recipe.',
                //       items: {
                //         type: 'string',
                //         description:
                //           'Contains instructions for the particular step in the recipe.',
                //       },
                //     },
                //     nutrition_facts: {
                //       type: 'object',
                //       description:
                //         'Nutrition information (per serving), including: calories, fat, carbs and protien. Only return 1 serving unless other mentioned.',
                //       properties: {
                //         calorie_breakdown: {
                //           type: 'object',
                //           description:
                //             'Breakdown of calories in the food item mentioned',
                //           properties: {
                //             calories: {
                //               type: 'number',
                //               description: 'Total calorie amount',
                //             },
                //             protein: {
                //               type: 'number',
                //               description:
                //                 'Amount of protein calories. Unit is calories',
                //             },
                //             carbohydrates: {
                //               type: 'number',
                //               description:
                //                 'Amount of carbohydrates calories. Unit is calories',
                //             },
                //             fat: {
                //               type: 'number',
                //               description:
                //                 'Amount of fat calories. Unit is calories',
                //             },
                //           },
                //         },
                //       },
                //     },
                //     time_to_prepare: {
                //       type: 'object',
                //       description:
                //         'Breakdown of prep time, cook time and total time to create the recipe.',
                //       properties: {
                //         prep_time: {
                //           type: 'string',
                //           description:
                //             'Time it takes to prepare the food before cooking. Unit is measured using minutes or hours.',
                //         },
                //         cook_time: {
                //           type: 'string',
                //           description:
                //             'Time it takes to cook the food. Unit is measured using minutes or hours.',
                //         },
                //         total_time: {
                //           type: 'string',
                //           description:
                //             'Total time combining prep time and cook time. Unit is measured using minutes or hours.',
                //         },
                //       },
                //     },
                //   },
                // },
                lifestyle_tip: {
                  type: 'object',
                  description:
                    'Increase motivation and try to help the user better understand nutrition.',
                  properties: {
                    tip: {
                      type: 'string',
                      description:
                        'Provide a helpful tip or fact based off the food items that was in the template. Please be creative but grounded in facts.',
                    },
                    quote: {
                      type: 'string',
                      description:
                        'Provide a motivation quote that will inspire the user to keep going. Keep the quote related to nutrition, dieting and fitness.',
                    },
                  },
                },
              },
            },
          },
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
    console.log(completion.choices[0].message.function_call.arguments)
    result = JSON.parse(completion.choices[0].message.function_call.arguments)
    let functionName = completion.choices[0].message.function_call.name
    console.log(result)
    if (functionName == 'errorWhenMissingTranscript') {
      throw new BadRequestError(result.resolution)
    }
    return result
  }
}

const sendSms = async (phoneNumber, message) => {
  client.messages
    .create({
      body: message,
      from: fromPhoneNumber,
      to: phoneNumber,
    })
    .then(message => console.log(message.sid))
}

const insertInbodyScanDetails = async (clientId, data) => {
  try {
    // First, process the main InbodyScan entry
    console.log("Data: ", data)
    let existingEntry = await prisma.inbodyScan.findFirst({
      where: {
        testDateAndTime: new Date(data.testDateAndTime),
        clientId: clientId,
      },
      include: {
        bodyCompositionAnalysis: true,
        muscleFatAnalysis: true,
        obesityAnalysis: true,
        segmentalLeanAnalysis: {
          include: {
            rightArm: true,
            leftArm: true,
            trunk: true,
            rightLeg: true,
            leftLeg: true,
          },
        },
        ecwTbwAnalysis: true,
      },
    })

    if (existingEntry) {
      // If an entry exists, update it with any provided values
      await prisma.inbodyScan.update({
        where: {
          id: existingEntry.id,
        },
        data: {
          height: data.height ?? existingEntry.height,
          age: data.age ?? existingEntry.age,
          gender: data.gender ?? existingEntry.gender,
          visceralFatLevel:
            data.visceralFatLevel ?? existingEntry.visceralFatLevel,
          basalMetabolicRate:
            data.basalMetabolicRate ?? existingEntry.basalMetabolicRate,
          bodyCompositionAnalysis: data.bodyCompositionAnalysis
            ? {
                upsert: {
                  create: {
                    intracellularWater:
                      data.bodyCompositionAnalysis.intracellularWater,
                    extracellularWater:
                      data.bodyCompositionAnalysis.extracellularWater,
                    dryLeanMass: data.bodyCompositionAnalysis.dryLeanMass,
                    bodyFatMass: data.bodyCompositionAnalysis.bodyFatMass,
                    totalBodyWater: data.bodyCompositionAnalysis.totalBodyWater,
                    leanBodyMass: data.bodyCompositionAnalysis.leanBodyMass,
                    weight: data.bodyCompositionAnalysis.weight,
                    imageUrl: data.bodyCompositionAnalysis.imageUrl,
                  },
                  update: {
                    intracellularWater:
                      data.bodyCompositionAnalysis.intracellularWater ??
                      existingEntry.bodyCompositionAnalysis?.intracellularWater,
                    extracellularWater:
                      data.bodyCompositionAnalysis.extracellularWater ??
                      existingEntry.bodyCompositionAnalysis?.extracellularWater,
                    dryLeanMass:
                      data.bodyCompositionAnalysis.dryLeanMass ??
                      existingEntry.bodyCompositionAnalysis?.dryLeanMass,
                    bodyFatMass:
                      data.bodyCompositionAnalysis.bodyFatMass ??
                      existingEntry.bodyCompositionAnalysis?.bodyFatMass,
                    totalBodyWater:
                      data.bodyCompositionAnalysis.totalBodyWater ??
                      existingEntry.bodyCompositionAnalysis?.totalBodyWater,
                    leanBodyMass:
                      data.bodyCompositionAnalysis.leanBodyMass ??
                      existingEntry.bodyCompositionAnalysis?.leanBodyMass,
                    weight:
                      data.bodyCompositionAnalysis.weight ??
                      existingEntry.bodyCompositionAnalysis?.weight,
                    imageUrl:
                      data.bodyCompositionAnalysis.imageUrl ??
                      existingEntry.bodyCompositionAnalysis?.imageUrl,
                  },
                },
              }
            : undefined,
          muscleFatAnalysis: data.muscleFatAnalysis
            ? {
                upsert: {
                  create: {
                    weight: data.muscleFatAnalysis.weight,
                    smm: data.muscleFatAnalysis.SMM,
                    bodyFatMass: data.muscleFatAnalysis.bodyFatMass,
                  },
                  update: {
                    weight:
                      data.muscleFatAnalysis.weight ??
                      existingEntry.muscleFatAnalysis?.weight,
                    smm:
                      data.muscleFatAnalysis.SMM ??
                      existingEntry.muscleFatAnalysis?.smm,
                    bodyFatMass:
                      data.muscleFatAnalysis.bodyFatMass ??
                      existingEntry.muscleFatAnalysis?.bodyFatMass,
                  },
                },
              }
            : undefined,
          obesityAnalysis: data.obesityAnalysis
            ? {
                upsert: {
                  create: {
                    bmi: data.obesityAnalysis.BMI,
                    pbf: data.obesityAnalysis.PBF,
                  },
                  update: {
                    bmi:
                      data.obesityAnalysis.BMI ??
                      existingEntry.obesityAnalysis?.bmi,
                    pbf:
                      data.obesityAnalysis.PBF ??
                      existingEntry.obesityAnalysis?.pbf,
                  },
                },
              }
            : undefined,
          segmentalLeanAnalysis: data.segmentalLeanAnalysis
            ? {
                upsert: {
                  create: {
                    rightArm: data.segmentalLeanAnalysis.rightArm
                      ? {
                          create: {
                            pounds: data.segmentalLeanAnalysis.rightArm.pounds,
                            percentage:
                              data.segmentalLeanAnalysis.rightArm.percentage,
                          },
                        }
                      : undefined,
                    leftArm: data.segmentalLeanAnalysis.leftArm
                      ? {
                          create: {
                            pounds: data.segmentalLeanAnalysis.leftArm.pounds,
                            percentage:
                              data.segmentalLeanAnalysis.leftArm.percentage,
                          },
                        }
                      : undefined,
                    trunk: data.segmentalLeanAnalysis.trunk
                      ? {
                          create: {
                            pounds: data.segmentalLeanAnalysis.trunk.pounds,
                            percentage:
                              data.segmentalLeanAnalysis.trunk.percentage,
                          },
                        }
                      : undefined,
                    rightLeg: data.segmentalLeanAnalysis.rightLeg
                      ? {
                          create: {
                            pounds: data.segmentalLeanAnalysis.rightLeg.pounds,
                            percentage:
                              data.segmentalLeanAnalysis.rightLeg.percentage,
                          },
                        }
                      : undefined,
                    leftLeg: data.segmentalLeanAnalysis.leftLeg
                      ? {
                          create: {
                            pounds: data.segmentalLeanAnalysis.leftLeg.pounds,
                            percentage:
                              data.segmentalLeanAnalysis.leftLeg.percentage,
                          },
                        }
                      : undefined,
                  },
                  update: {
                    rightArm: data.segmentalLeanAnalysis.rightArm
                      ? {
                          upsert: {
                            where: {
                              id:
                                existingEntry.segmentalLeanAnalysis?.rightArm
                                  ?.id ?? 0, // Replace with your ID field
                            },
                            create: {
                              pounds:
                                data.segmentalLeanAnalysis.rightArm.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.rightArm.percentage,
                            },
                            update: {
                              pounds:
                                data.segmentalLeanAnalysis.rightArm.pounds ??
                                existingEntry.segmentalLeanAnalysis?.rightArm
                                  ?.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.rightArm
                                  .percentage ??
                                existingEntry.segmentalLeanAnalysis?.rightArm
                                  ?.percentage,
                            },
                          },
                        }
                      : undefined,
                    leftArm: data.segmentalLeanAnalysis.leftArm
                      ? {
                          upsert: {
                            where: {
                              id:
                                existingEntry.segmentalLeanAnalysis?.leftArm
                                  ?.id ?? 0, // Replace with your ID field
                            },
                            create: {
                              pounds: data.segmentalLeanAnalysis.leftArm.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.leftArm.percentage,
                            },
                            update: {
                              pounds:
                                data.segmentalLeanAnalysis.leftArm.pounds ??
                                existingEntry.segmentalLeanAnalysis?.leftArm
                                  ?.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.leftArm.percentage ??
                                existingEntry.segmentalLeanAnalysis?.leftArm
                                  ?.percentage,
                            },
                          },
                        }
                      : undefined,
                    trunk: data.segmentalLeanAnalysis.trunk
                      ? {
                          upsert: {
                            where: {
                              id:
                                existingEntry.segmentalLeanAnalysis?.trunk
                                  ?.id ?? 0, // Replace with your ID field
                            },
                            create: {
                              pounds: data.segmentalLeanAnalysis.trunk.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.trunk.percentage,
                            },
                            update: {
                              pounds:
                                data.segmentalLeanAnalysis.trunk.pounds ??
                                existingEntry.segmentalLeanAnalysis?.trunk
                                  ?.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.trunk.percentage ??
                                existingEntry.segmentalLeanAnalysis?.trunk
                                  ?.percentage,
                            },
                          },
                        }
                      : undefined,
                    rightLeg: data.segmentalLeanAnalysis.rightLeg
                      ? {
                          upsert: {
                            where: {
                              id:
                                existingEntry.segmentalLeanAnalysis?.rightLeg
                                  ?.id ?? 0, // Replace with your ID field
                            },
                            create: {
                              pounds:
                                data.segmentalLeanAnalysis.rightLeg.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.rightLeg.percentage,
                            },
                            update: {
                              pounds:
                                data.segmentalLeanAnalysis.rightLeg.pounds ??
                                existingEntry.segmentalLeanAnalysis?.rightLeg
                                  ?.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.rightLeg
                                  .percentage ??
                                existingEntry.segmentalLeanAnalysis?.rightLeg
                                  ?.percentage,
                            },
                          },
                        }
                      : undefined,
                    leftLeg: data.segmentalLeanAnalysis.leftLeg
                      ? {
                          upsert: {
                            where: {
                              id:
                                existingEntry.segmentalLeanAnalysis?.leftLeg
                                  ?.id ?? 0, // Replace with your ID field
                            },
                            create: {
                              pounds: data.segmentalLeanAnalysis.leftLeg.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.leftLeg.percentage,
                            },
                            update: {
                              pounds:
                                data.segmentalLeanAnalysis.leftLeg.pounds ??
                                existingEntry.segmentalLeanAnalysis?.leftLeg
                                  ?.pounds,
                              percentage:
                                data.segmentalLeanAnalysis.leftLeg.percentage ??
                                existingEntry.segmentalLeanAnalysis?.leftLeg
                                  ?.percentage,
                            },
                          },
                        }
                      : undefined,
                  },
                },
              }
            : undefined,
          ecwTbwAnalysis: data.ecwTbwAnalysis
            ? {
                upsert: {
                  create: {
                    ecwTbw: data.ecwTbwAnalysis.ECW_TBW,
                  },
                  update: {
                    ecwTbw:
                      data.ecwTbwAnalysis.ECW_TBW ??
                      existingEntry.ecwTbwAnalysis?.ecwTbw,
                  },
                },
              }
            : undefined,
        },
      })
      console.log('InbodyScan record updated:', existingEntry)
    } else {
      // If no entry exists, create a new one with the provided data
      const newEntry = await prisma.inbodyScan.create({
        data: {
          clientId: clientId,
          testDateAndTime: new Date(data.testDateAndTime) || new Date(),
          height: data.height || null,
          age: data.age || null,
          gender: data.gender || null,
          visceralFatLevel: data.visceralFatLevel || null,
          basalMetabolicRate: data.basalMetabolicRate || null,
          bodyCompositionAnalysis: data.bodyCompositionAnalysis
            ? {
                create: {
                  intracellularWater:
                    data.bodyCompositionAnalysis.intracellularWater || null,
                  extracellularWater:
                    data.bodyCompositionAnalysis.extracellularWater || null,
                  dryLeanMass: data.bodyCompositionAnalysis.dryLeanMass || null,
                  bodyFatMass: data.bodyCompositionAnalysis.bodyFatMass || null,
                  totalBodyWater:
                    data.bodyCompositionAnalysis.totalBodyWater || null,
                  leanBodyMass:
                    data.bodyCompositionAnalysis.leanBodyMass || null,
                  weight: data.bodyCompositionAnalysis.weight || null,
                  imageUrl: data.bodyCompositionAnalysis.imageUrl || null,
                },
              }
            : undefined,
          muscleFatAnalysis: data.muscleFatAnalysis
            ? {
                create: {
                  weight: data.muscleFatAnalysis.weight || null,
                  smm: data.muscleFatAnalysis.SMM || null,
                  bodyFatMass: data.muscleFatAnalysis.bodyFatMass || null,
                },
              }
            : undefined,
          obesityAnalysis: data.obesityAnalysis
            ? {
                create: {
                  bmi: data.obesityAnalysis.BMI || null,
                  pbf: data.obesityAnalysis.PBF || null,
                },
              }
            : undefined,
          segmentalLeanAnalysis: data.segmentalLeanAnalysis
            ? {
                create: {
                  rightArm: data.segmentalLeanAnalysis.rightArm
                    ? {
                        create: {
                          pounds:
                            data.segmentalLeanAnalysis.rightArm.pounds || null,
                          percentage:
                            data.segmentalLeanAnalysis.rightArm.percentage ||
                            null,
                        },
                      }
                    : undefined,
                  leftArm: data.segmentalLeanAnalysis.leftArm
                    ? {
                        create: {
                          pounds:
                            data.segmentalLeanAnalysis.leftArm.pounds || null,
                          percentage:
                            data.segmentalLeanAnalysis.leftArm.percentage ||
                            null,
                        },
                      }
                    : undefined,
                  trunk: data.segmentalLeanAnalysis.trunk
                    ? {
                        create: {
                          pounds:
                            data.segmentalLeanAnalysis.trunk.pounds || null,
                          percentage:
                            data.segmentalLeanAnalysis.trunk.percentage || null,
                        },
                      }
                    : undefined,
                  rightLeg: data.segmentalLeanAnalysis.rightLeg
                    ? {
                        create: {
                          pounds:
                            data.segmentalLeanAnalysis.rightLeg.pounds || null,
                          percentage:
                            data.segmentalLeanAnalysis.rightLeg.percentage ||
                            null,
                        },
                      }
                    : undefined,
                  leftLeg: data.segmentalLeanAnalysis.leftLeg
                    ? {
                        create: {
                          pounds:
                            data.segmentalLeanAnalysis.leftLeg.pounds || null,
                          percentage:
                            data.segmentalLeanAnalysis.leftLeg.percentage ||
                            null,
                        },
                      }
                    : undefined,
                },
              }
            : undefined,
          ecwTbwAnalysis: data.ecwTbwAnalysis
            ? {
                create: {
                  ecwTbw: data.ecwTbwAnalysis.ECW_TBW || null,
                },
              }
            : undefined,
        },
      })
      console.log('New InbodyScan record created:', newEntry)
    }

    // Process bodyCompositionHistory entries
    if (
      data.bodyCompositionHistory &&
      Array.isArray(data.bodyCompositionHistory)
    ) {
      for (const history of data.bodyCompositionHistory) {
        // Check if an entry already exists for the given date in history
        const existingHistoryEntry = await prisma.inbodyScan.findFirst({
          where: {
            testDateAndTime: new Date(history.date),
          },
        })

        if (!existingHistoryEntry) {
          await prisma.inbodyScan.create({
            data: {
              clientId: clientId,
              testDateAndTime: history.date,
              height: data.height || null,
              age: data.age || null,
              gender: data.gender || null,
              muscleFatAnalysis: {
                create: {
                  smm: history.SMM || null,
                  bodyFatMass: history.PBF || null,
                  weight: history.weight || null,
                },
              },
              ecwTbwAnalysis: {
                create: {
                  ecwTbw: history.ECW_TBW || null,
                },
              },
            },
          })
          console.log(
            'New history InbodyScan record created for date:',
            history.date
          )
        } else {
          // If an entry exists, update it with any provided values
          await prisma.inbodyScan.update({
            where: {
              id: existingHistoryEntry.id,
            },
            data: {
              muscleFatAnalysis:
                history.SMM || history.PBF || history.weight
                  ? {
                      upsert: {
                        create: {
                          smm: history.SMM,
                          bodyFatMass: history.PBF,
                          weight: history.weight
                        },
                        update: {
                          smm:
                            history.SMM ??
                            existingHistoryEntry.muscleFatAnalysis?.smm,
                          bodyFatMass:
                            history.PBF ??
                            existingHistoryEntry.muscleFatAnalysis?.bodyFatMass,
                          weight:
                            history.weight ??
                            existingHistoryEntry.muscleFatAnalysis?.weight
                        },
                      },
                    }
                  : undefined,
              ecwTbwAnalysis: history.ECW_TBW
                ? {
                    upsert: {
                      create: {
                        ecwTbw: history.ECW_TBW,
                      },
                      update: {
                        ecwTbw:
                          history.ECW_TBW ??
                          existingHistoryEntry.ecwTbwAnalysis?.ecwTbw,
                      },
                    },
                  }
                : undefined,
            },
          })
          console.log(
            'Existing history InbodyScan record updated for date:',
            history.date
          )
        }
      }
    }
  } catch (error) {
    console.error('Error upserting InbodyScan details:', error)
  }
}


module.exports = {
  callUser,
  getCall,
  transcriptToNotes,
  sendSms,
  insertInbodyScanDetails,
}

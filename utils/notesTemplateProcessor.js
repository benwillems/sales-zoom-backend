const { BadRequestError } = require('../errors/HttpError')

function templateToSimplifiedNotes(obj) {
  const result = {};
  try {
    // Helper function to process each property based on its type
    function processProperty(property, key) {
      if (property?.type === 'object') {
        const properties = property.properties;
        const output = {};
        for (const [propKey, propValue] of Object.entries(properties)) {
          output[propKey] = propValue.description;
        }
        result[key] = output;
      } else if (property?.type === 'array') {
        if (property.description) {
          result[key] = property.description;
        }
      } else if (property?.description) {
        result[key] = property.description;
      }
    }

    // Process all properties dynamically in 'visit'
    const visitProperties = obj.parameters.properties.visit
      ? obj.parameters.properties.visit?.properties
      : obj.parameters.properties.sales_call
      ? obj.parameters.properties.sales_call?.properties
      : obj.parameters.properties;
    for (const [key, property] of Object.entries(visitProperties)) {
      processProperty(property, key);
    }

    // Directly assign simple properties that do not need processing
    result.defaults = obj.defaults;
    result.order = obj.order;
    return result;
  } catch (error) {
    console.log('error: ', error);
    throw new BadRequestError(error);
  }
}

function simplifiedNotesToTemplate(template, simplifiedNotes) {
  if (template.parameters.properties.visit.properties.nutrition_targets?.properties) {
    template.parameters.properties.visit.properties.nutrition_targets.properties =
      {}
  }
  Object.entries(simplifiedNotes.nutrition_targets || {}).forEach(
    ([key, value]) => {
      template.parameters.properties.visit.properties.nutrition_targets.properties[
        key
      ] = {
        type: 'string',
        description: value,
      }
    }
  )

  if (template.parameters.properties.visit.properties.notes?.properties) {
    template.parameters.properties.visit.properties.notes.properties = {}
  }
  Object.entries(simplifiedNotes.notes || {}).forEach(([key, value]) => {
    template.parameters.properties.visit.properties.notes.properties[key] =
      {
        type: 'string',
        description: value,
      }
  })

  if (template.parameters.properties.visit.properties.nutritional_assessment?.properties) {
    template.parameters.properties.visit.properties.nutritional_assessment.properties = {}
  }
  Object.entries(simplifiedNotes.nutritional_assessment || {}).forEach(([key, value]) => {
    template.parameters.properties.visit.properties.nutritional_assessment.properties[key] =
      {
        type: 'string',
        description: value,
      }
  })

  if (template.parameters.properties.visit.properties.calorie_goal_breakdown?.properties) {
    template.parameters.properties.visit.properties.calorie_goal_breakdown.properties =
      {}
  }
  Object.entries(simplifiedNotes.calorie_goal_breakdown || {}).forEach(
    ([key, value]) => {
      template.parameters.properties.visit.properties.calorie_goal_breakdown.properties[
        key
      ] = {
        type: 'string',
        description: value,
      }
    }
  )

  if (template.parameters.properties.visit.properties.onboard_details?.properties) {
    template.parameters.properties.visit.properties.onboard_details.properties = {}
  }
  Object.entries(simplifiedNotes.onboard_details || {}).forEach(([key, value]) => {
    template.parameters.properties.visit.properties.onboard_details.properties[key] =
      {
        type: 'string',
        description: value,
      }
  })

  if (
    template &&
    template.parameters &&
    template.parameters.properties &&
    template.parameters.properties.visit &&
    template.parameters.properties.visit.properties
  ) {
    const props = template.parameters.properties.visit.properties

    if (props.goals) {
      props.goals.description = simplifiedNotes.goals
    }
    if (props.recap_or_homework) {
      props.recap_or_homework.description = simplifiedNotes.recap_or_homework
    }
    if (props.why_now) {
      props.why_now.description = simplifiedNotes.why_now
    }
    if (props.wins) {
      props.wins.description = simplifiedNotes.wins
    }
    if (props.obstacles) {
      props.obstacles.description = simplifiedNotes.obstacles
    }
    if (props.last_check_in_call_report) {
      props.last_check_in_call_report.description =
        simplifiedNotes.last_check_in_call_report
    }
    if (props.topics_to_discuss) {
      props.topics_to_discuss.description = simplifiedNotes.topics_to_discuss
    }
  }


  template.defaults = simplifiedNotes.defaults
  template.order = simplifiedNotes.order
  return template
}

const defaults = {
}

const order = {
}

const defaultNotesTemplate = {
  name: 'nutritionTranscriptToStructure',
  description:
    'Convert the appointment of a client with nutrition coach in the audio transcript to structured notes of concise and clear bullet points with all details included.',
  parameters: {
    type: 'object',
    properties: {
      visit: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A 30 character brief summary of the appointment',
          },
          wins: {
            type: 'array',
            description:
              'Provide thorough, clear and concise points on wins of the client related to diet, habits and nutrient needs.',
            items: {
              type: 'string',
            },
          },
          obstacles: {
            type: 'array',
            description:
              'Provide thorough, clear and concise points on obstacles that the client faced related to diet, habits, nutrition, lifestyle, etc.',
            items: {
              type: 'string',
            },
          },
          nutrition_targets: {
            type: 'object',
            description:
              'Capture all possible details mentioned in the transcript. Leave the section empty if no mention in the transcript.',
            properties: {
              calories: {
                type: 'string',
                description:
                  'Provide goal and average calories target of client.',
              },
              protein: {
                type: 'string',
                description:
                  'Provide goal and average protein target of client.',
              },
              carbs: {
                type: 'string',
                description: 'Provide carbs target of client.',
              },
              fats: {
                type: 'string',
                description: 'Provide fats target of client.',
              },
              workouts: {
                type: 'string',
                description: 'Provide workout target of client.',
              },
              last_inbody_scan: {
                type: 'string',
                description: 'Provide last inbody scan details of client.',
              },
              next_check_in_call: {
                type: 'string',
                description: 'Provide next check in call details of client.',
              },
            },
          },
          last_check_in_call_report: {
            type: 'array',
            description:
              'Clear, concise points included about the last check in call report',
            items: {
              type: 'string',
            },
          },
          topics_to_discuss: {
            type: 'array',
            description:
              'Provide thorough, clear and concise points on topics to be discussed for the next call',
            items: {
              type: 'string',
            },
          },
          notes: {
            type: 'object',
            description: 'Provide thorough, clear and concise points on notes. ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT.',
            properties: {
              client_information: {
                type: 'string',
                description:
                  'Capture basic demographic and contact information of the client, including name, age, gender, and contact details.',
              },
              health_history: {
                type: 'string',
                description:
                  'Include details about medical conditions, allergies, family health history, medications, and any other health-related information.',
              },
              dietary_habits: {
                type: 'string',
                description:
                  "Describe the client's typical food intake, meal patterns, dietary preferences, aversions, and any cultural dietary practices.",
              },
              lifestyle_information: {
                type: 'string',
                description:
                  "Document the client's physical activity levels, types of exercise, sleep patterns, stress levels, smoking, and alcohol consumption.",
              },
              nutritional_assessment: {
                type: 'string',
                description:
                  'Record body measurements such as weight, height, BMI, symptoms related to nutritional deficiencies or excesses, and recent lab test results if applicable.',
              },
              goals_and_motivations: {
                type: 'string',
                description:
                  "Note the client's short-term and long-term nutritional and health goals, and their motivation for seeking nutritional counseling.",
              },
              challenges_and_barriers: {
                type: 'string',
                description:
                  'List any challenges the client faces in adhering to dietary recommendations, including budget constraints, lack of time, and emotional or psychological barriers.',
              },
              plan_and_recommendations: {
                type: 'string',
                description:
                  'Detail the dietary recommendations provided, lifestyle or behavior change suggestions, follow-up plans, and set a date for the next consultation.',
              },
              client_feedback_and_questions: {
                type: 'string',
                description:
                  'Capture questions asked by the client, responses given, and any feedback regarding the consultation and the plan moving forward.',
              },
              personal_notes: {
                type: 'string',
                description:
                  'Include personal observations about the client’s demeanor or readiness to change, and reflections that might be helpful for future sessions.',
              },
            },
          },
          recap_or_homework: {
            type: 'array',
            description: 'Include any points for recap or homework for the client or the nutritionist.',
            items: {
              type: 'string',
            }
          }
        },
      },
    },
  },
  defaults: defaults,
  order: order,
}

module.exports = {
  templateToSimplifiedNotes,
  simplifiedNotesToTemplate,
  defaultNotesTemplate,
}

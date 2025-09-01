const express = require('express');
const axios = require('axios');
const router = express.Router();
const { PineconeClient } = require("@pinecone-database/pinecone");
const { OpenAI } = require("openai");
const {downloadAndProcessPDF, getSignedUrl, extractSummaryFromPdf, transcribeAudio, extractSummaryFromAudioTranscript, templateToSimplifiedNotes, simplifiedNotesToTemplate, summaryListToBullet, answerQuestionsAboutRecords} = require('./util');
const pdfjsLib = require('pdfjs-dist');
const fileUpload = require('express-fileupload');
const pdfParse = require('pdf-parse');
const { PrismaClient, AppointmentStatus } = require('@prisma/client');
const prisma = new PrismaClient();
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const os = require('os');
const tmp = require('tmp');
const { get } = require('https');
const ffmpeg = require('fluent-ffmpeg');
const sgMail = require('@sendgrid/mail')
const {sendSms} = require('./utils/phoneUtils')

sgMail.setApiKey(process.env.SENDGRID_API_KEY)


AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'us-west-2'  // e.g., 'us-west-1'
});

const s3 = new AWS.S3();


const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'], // This is the default and can be omitted
});

const pinecone = new PineconeClient();

async function addMissingTemplatesForUsers() {
  try {
    // Fetch all users with their current templates
    const users = await prisma.user.findMany({
      include: {
        templates: true,
      },
    })

    // Fetch all default templates
    const defaultTemplates = await prisma.defaultTemplate.findMany()

    for (const user of users) {
      // Create a set of user's current template IDs
      const userTemplateIds = new Set(
        user.templates.map(t => t.defaultTemplateId)
      )

      for (const defaultTemplate of defaultTemplates) {
        // Check if the user already has this default template
        if (!userTemplateIds.has(defaultTemplate.id)) {
          // If not, create a new template for the user based on the default template
          await prisma.template.create({
            data: {
              name: defaultTemplate.name,
              notesTemplate: defaultTemplate.notesTemplate,
              type: defaultTemplate.type,
              userId: user.id,
              organizationId: user.organizationId,
              defaultTemplateId: defaultTemplate.id,
              default: false, // set to false as it's a user-specific instance of a default template
            },
          })
          console.log(
            `Template '${defaultTemplate.name}' added for user ${user.name}.`
          )
        }
      }
    }

    console.log('All missing templates added for all users.')
  } catch (error) {
    console.error('Failed to add templates due to error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

async function insertIntoDefaultTemplate(templateData) {
  try {
    const createdTemplate = await prisma.defaultTemplate.create({
      data: {
        name: templateData.name,
        notesTemplate: templateData.notesTemplate || {}, // Assuming JSON field with default if not provided
        type: templateData.type,
      },
    })
    console.log('Default Template created:', createdTemplate)
  } catch (error) {
    console.error('Error creating Default Template:', error)
  }
}

const defaults = {}

const order = {}

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
            description:
              'Provide thorough, clear and concise points on notes. ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT.',
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
            description:
              'Include any points for recap or homework for the client or the nutritionist.',
            items: {
              type: 'string',
            },
          },
        },
      },
    },
  },
  defaults: defaults,
  order: order,
}
const onBoardingCallTemplate = {
  name: 'nutritionOnBoardingCallTranscriptToStructure',
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
          onboard_details: {
            type: 'object',
            description:
              'Provide details about next check-in, client details, date/time of appointment.',
            properties: {
              next_check_in: {
                type: 'string',
                description: 'Date for next check-in',
              },
              client_details: {
                type: 'string',
                description:
                  'Capture basic demographic and contact information of the client, including name, age, gender, and contact details.',
              },
            },
          },
          calorie_goal_breakdown: {
            type: 'object',
            description: 'Breakdown of micronutrient goals and calories',
            properties: {
              calories: {
                type: 'string',
                description: 'Total goal calorie amount',
              },
              protein: {
                type: 'string',
                description:
                  'Daily goal amount of protein grams. Unit is grams',
              },
              carbohydrates: {
                type: 'string',
                description:
                  'Daily goal amount of carbohydrates grams. Unit is grams',
              },
              fat: {
                type: 'string',
                description: 'Daily goal amount of fat grams. Unit is grams',
              },
            },
          },
          nutritional_assessment: {
            type: 'object',
            description:
              'Record body measurements such as bodyweight/BMR, InBody date, daily calorie target, and check-in day Y/N Day/Time',
            properties: {
              bodyweight_and_bmr: {
                type: 'string',
                description:
                  'Provide the current weight of the client (bodyweight) and BMR (Basal Metabolic Rate) the number of calories the client needs to maintain their current weight at rest. This is essential for determining the daily calorie target. Return this value as bodyweight/BMR',
              },
              inbody_date: {
                type: 'string',
                description:
                  'The date when the client last had an InBody scan.',
              },
              check_in_day: {
                type: 'string',
                description:
                  "The day of the week when the client will check in with the nutrionist. Include the confirmation from the client such as 'Yes, Monday at 9 AM on 5/13/2024.'",
              },
            },
          },
          why_now: {
            type: 'string',
            description:
              'Capture details for the reason on starting the nutrition plan at this time (e.g., health concerns, upcoming event, lifestyle change).',
          },
          notes: {
            type: 'object',
            description:
              'Provide thorough, clear and concise points on notes. ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT.',
            properties: {
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
              workouts_per_week: {
                type: 'string',
                description:
                  'Capture the amount of workouts per week the client wants to do or nutrionist recommends',
              },
            },
          },
          goals: {
            type: 'array',
            description:
              'Note the client’s short-term and long-term nutritional goals include health goals, weekly workout goals and timeline of those goals for example loose 20 pounds in the next 6 months. If no timeline mentioned, mention that along with the goal.',
            items: {
              type: 'string',
            },
          },
          obstacles: {
            type: 'array',
            description:
              'Provide thorough, clear and concise points on obstacles that the client faced related to diet, habits, nutrition, lifestyle, workouts, etc.',
            items: {
              type: 'string',
            },
          },
          recap_or_homework: {
            type: 'array',
            description:
              'Include any points for recap or homework for the client or the nutritionist.',
            items: {
              type: 'string',
            },
          },
        },
      },
    },
  },
}

const checkInCallTemplate = {
  name: 'nutritionTranscriptToStructure',
  order: {},
  defaults: {},
  parameters: {
    type: 'object',
    properties: {
      visit: {
        type: 'object',
        properties: {
          wins: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Provide thorough, clear and concise points on wins of the client related to diet, habits and nutrient needs.',
          },
          notes: {
            type: 'object',
            properties: {
              dietary_habits: {
                type: 'string',
                description:
                  "Describe the client's typical food intake, meal patterns, dietary preferences, aversions, and any cultural dietary practices.",
              },
              health_history: {
                type: 'string',
                description:
                  'Include details about medical conditions, allergies, family health history, medications, and any other health-related information.',
              },
              personal_notes: {
                type: 'string',
                description:
                  'Include personal observations about the client’s demeanor or readiness to change, and reflections that might be helpful for future sessions.',
              },
              client_information: {
                type: 'string',
                description:
                  'Capture basic demographic and contact information of the client, including name, age, gender, and contact details.',
              },
              goals_and_motivations: {
                type: 'string',
                description:
                  "Note the client's short-term and long-term nutritional and health goals, and their motivation for seeking nutritional counseling.",
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
            },
            description:
              'Provide thorough, clear and concise points on notes. ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT.',
          },
          summary: {
            type: 'string',
            description: 'A 30 character brief summary of the appointment',
          },
          obstacles: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Provide thorough, clear and concise points on obstacles that the client faced related to diet, habits, nutrition, lifestyle, etc.',
          },
          nutrition_targets: {
            type: 'object',
            properties: {
              fats: {
                type: 'string',
                description: 'Provide fats target of client.',
              },
              carbs: {
                type: 'string',
                description: 'Provide carbs target of client.',
              },
              protein: {
                type: 'string',
                description:
                  'Provide goal and average protein target of client.',
              },
              calories: {
                type: 'string',
                description:
                  'Provide goal and average calories target of client.',
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
            description:
              'Capture all possible details mentioned in the transcript. Leave the section empty if no mention in the transcript.',
          },
          recap_or_homework: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Include any points for recap or homework for the client or the nutritionist.',
          },
          topics_to_discuss: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Provide thorough, clear and concise points on topics to be discussed for the next call',
          },
          last_check_in_call_report: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Clear, concise points included about the last check in call report',
          },
        },
      },
    },
  },
  description:
    'Convert the appointment of a client with nutrition coach in the audio transcript to structured notes of concise and clear bullet points with all details included.',
}

const newTemplateData = {
  name: 'Check-in Call',
  notesTemplate: checkInCallTemplate, // This should be a JSON string
  type: 'Nutrition',
}

const salesTemplate = {
  name: 'gymSalesTranscriptToStructure',
  order: {},
  defaults: {},
  parameters: {
    type: 'object',
    properties: {
      sales_call: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              "A ~30 character, punchy headline that captures the essence of the call (e.g., 'Wants fat loss before wedding').",
          },
          personal_details: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description:
                  'Prospect’s full name if stated. Use exact spelling from the transcript.',
              },
              age: {
                type: 'string',
                description:
                  "Age or age range as quoted (e.g., '34', 'mid-40s'). If not stated, leave blank.",
              },
              marital_status: {
                type: 'string',
                description:
                  'Marital status mentioned by the prospect (e.g., single, married, divorced).',
              },
              spouse_kids: {
                type: 'string',
                description:
                  'Any mention of a spouse/partner and number/ages of children or dependents.',
              },
              occupation_profession: {
                type: 'string',
                description:
                  "Role, industry, or employment situation (e.g., 'software engineer', 'shift nurse', 'self-employed').",
              },
              household_type: {
                type: 'string',
                description:
                  "Household descriptor if explicitly mentioned (e.g., 'multi-generational', 'roommates', 'lives alone').",
              },
              referral_source: {
                type: 'string',
                description:
                  'How they heard about the gym (e.g., friend referral, Google, Instagram ad, drive-by).',
              },
            },
            description:
              'ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT. Basic prospect demographics and context that may influence buying decisions or program fit.',
          },
          psychographic_snapshot: {
            type: 'object',
            properties: {
              values_or_lifestyle_cues: {
                type: 'string',
                description:
                  'Signals about what they value and how they live (e.g., health, discipline, convenience, community, busy travel schedule). Quote or paraphrase faithfully.',
              },
              goals_or_aspirations: {
                type: 'string',
                description:
                  'Ambitions beyond immediate fitness metrics (e.g., role model for kids, feel confident at work, complete a first 10K).',
              },
              personality_or_communication_preferences: {
                type: 'string',
                description:
                  'Clues about tone and preference (e.g., direct/brief, detail-oriented, data-driven, needs accountability, prefers text over calls).',
              },
            },
            description:
              'A concise portrait of the prospect’s mindset and preferences to tailor the offer and follow-up.',
          },
          goals_magic_wand: {
            type: 'string',
            description:
              "If they could wave a magic wand and get one result, what would it be? Use their exact phrasing when possible (e.g., 'drop 20 lbs', 'feel athletic again').",
          },
          motivation: {
            type: 'object',
            properties: {
              why_now: {
                type: 'string',
                description:
                  'Immediate trigger that prompted outreach (e.g., upcoming wedding, doctor’s warning, clothes not fitting, plateau at current gym).',
              },
              what_matters_most: {
                type: 'string',
                description:
                  'Underlying priorities the prospect emphasizes (e.g., results fast, expert coaching, safety, schedule flexibility, community).',
              },
            },
            description:
              'The emotional and practical drivers behind the decision to consider a high-value membership.',
          },
          pain_points: {
            type: 'object',
            properties: {
              current_frustrations_struggles_limitations: {
                type: 'array',
                items: { type: 'string' },
                description:
                  "Bullet points of specific frustrations (e.g., 'no consistency', 'gym intimidation', 'stuck at same weight', 'travel disrupts routine').",
              },
              physical_emotional_mental_roadblocks: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Stated barriers such as low energy, stress, self-doubt, time scarcity, or overwhelm.',
              },
            },
            description:
              'Precisely list the problems the prospect wants solved. Do not infer beyond the transcript.',
          },
          the_gap: {
            type: 'object',
            properties: {
              what_they_tried_before: {
                type: 'array',
                items: { type: 'string' },
                description:
                  'Prior programs/diets/gyms/coaches/apps they mention (include durations or outcomes when stated).',
              },
              why_it_didnt_work: {
                type: 'string',
                description:
                  "Prospect’s stated reasons for past failures or plateaus (e.g., 'unsustainable', 'no guidance', 'injured', 'travel schedule').",
              },
            },
            description:
              'History of attempts and the stated reasons results fell short, to position a better fit.',
          },
          aches_injuries_limitations: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Any injuries, sensitivities, medical advisories, or movement constraints to consider (e.g., 'old knee surgery', 'lower-back tightness').",
          },
          objections: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Real or anticipated concerns voiced by the prospect (e.g., cost, contract length, commute, schedule, fear of intensity). Capture verbatim when possible.',
          },
          desired_outcomes_short_term: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Measurable or experiential wins they want in the first 4–8 weeks (e.g., 'lose 8–10 lbs', 'establish 3x/week habit', 'feel stronger').",
          },
          sasquatch_solutions_to_highlight: {
            type: 'array',
            items: { type: 'string' },
            description:
              "Exact gym features/services that map to their needs (e.g., 'individualized onboarding and movement screen', 'coach-led small groups', 'progress tracking & InBody scans', 'travel-proof programming', 'nutrition coaching add-on'). Only include what is mentioned or clearly tied to the call.",
          },
        },
        description:
          'Convert a sales call between a gym sales agent and a prospective member into structured, concise notes. ONLY CAPTURE DETAILS MENTIONED IN THE TRANSCRIPT. Use bullet-point lists where arrays are requested; keep phrasing faithful to the prospect when helpful for follow-up.',
      },
    },
  },
  description:
    'Function schema for extracting structured sales intelligence from a gym membership sales call transcript for a high-value program.',
}

const salesTemplateData = {
  name: 'Sales Call',
  notesTemplate: salesTemplate, // This should be a JSON string
  type: 'Sales',
}

router.get('/health', async (req, res) => {
  // await insertIntoDefaultTemplate(salesTemplateData)
  await addMissingTemplatesForUsers()
  // console.log("hi")
  // await sendSms('+12065183859', "Hi sid this is your nutrition check in?")
  return res.send("UP")
  // const msg = {
  //   to: 'bedeksid@gmail.com', // Change to your recipient
  //   from: 'hello@myvetassist.com', // Change to your verified sender
  //   subject: 'Sending with SendGrid is Fun',
  //   text: 'and easy to do anywhere, even with Node.js',
  //   html: '<strong>and easy to do anywhere, even with Node.js</strong>',
  // }
  // sgMail
  //   .send(msg)
  //   .then(() => {
  //     console.log('Email sent')
  //   })
  //   .catch(error => {
  //     console.error(error)
  //   })
  // let orgs = await prisma.organization.findMany()
  // for (const org of orgs) {
  //   let user = await prisma.user.create({
  //     data: {
  //       name: org.name,
  //       email: org.email,
  //       phone: org.phone,
  //       organizationId: org.id,
  //       uniqueAuthId: org.googleAccountId,
  //       notesTemplate: org.notesTemplate,
  //       roleId: 1,
  //       createdAt: org.createdAt,
  //       updatedAt: org.updatedAt,
  //     },
  //   })

  //   const appointments = await prisma.appointment.findMany({
  //     where: { organizationId: org.id },
  //   })

  //   // Step 3: Update each appointment to associate it with the new user's ID
  //   for (const appointment of appointments) {
  //     await prisma.appointment.update({
  //       where: {
  //         id: appointment.id, // Specify the appointment ID here
  //       },
  //       data: {
  //         userId: user.id, // Set the new userId for this appointment
  //       },
  //     })
  //   }
  // }
  // res.send("up")
  // await updatePhysicalExamInAppointments()
  // res.send("Up")
  // let text = {
  //   text: "The patient has been experiencing skin irritation in the axillary regions for the past six months, which has recently been compounded by signs of lethargy, decreased appetite, and decreased water intake over the last two days. The owner reports an odor emanating from the left ear with no current medications or flea prevention measures in place. The patient has been bathed with Burt's Bees shampoo and had blue methylene applied. The patient exhibits behaviors such as licking paws and pulling fur at the feet. Diet consists of Royal Canin dry food with the occasional chicken, and despite rarely getting fleas, lives in a household with multiple dogs. Physical Exam Weight 14.2 lbs BCS 7 or 9 indicating the patient is overweight Vital Signs Temperature 101.6°F Pulse rate 144 bpm Respiratory rate 32 bpm Notable inflammation, redness, and odor present in the left ear, right ear is clean. Nose and throat clean with no discharge. Throat shows no significant findings. Oral exam teeth are without visible decay, fractures, or wear. Gums are pink, firm, and show no signs of inflammation or bleeding. Heart rate and rhythm are normal with no detected murmurs or arrhythmias. Pulse are strong and synchronous. Inner lung feels bilaterally, no abnormalities noted. Muscle condition score is 3 on 3 indicating health. Signs of flea allergy are present on the ventral abdomen with black lines and red inflammation. Similar allergy signs noted in the axillary regions and on both front and back legs. The cord is pure white, clean, and well-groomed with no evidence of hair loss or matting. Peripheral lymph nodes are either non-palpable or less than 0.5 cm. Patient reveals a soft, non-tender abdomen with no palpable masses or ganymagaly. Normal external genitalia with no signs of discharge or inflammation. Patient is alert and responsive with no abnormalities noted. Right eye shows discharge and redness indicating possible infection or irritation. The patient shows signs of allergy affecting the skin, ears, and eyes and is also overweight. Initiate treatment for allergies and address ear, skin, and eyes issue. Implement a weight reduction plan. Exclude chicken from the diet and monitor for improvement. Administer Cytopoint 20mg injection for flea allergy control, dexamethasone, sp.5mL IV for immediate allergy relief, Neopolydix for eye infection, Simplicif 100mg half tablet for bacterial infection, and Genesis topical spray for skin irritation. Implement Bravacto or Credelio for flea prevention which was declined by the client. Ear cytology, cleaning, and medication were also declined by the client after swabbing and slight preparation of the left ear. Advise client on the importance of keeping the patient's ear elevated for air circulation to prevent moisture accumulation and using cotton balls in the ear during baths. Emphasize the critical role of allergy management in preventing recurring ear issues and discuss the correlation between water presence in the ear and allergies. Recommended continuation of Royal Canin dry food while avoiding chicken to assess for dietary allergies. Discussed flea allergy science and prevention strategies along with the importance of weight management through feeding schedule and portion control. Suggested separating dogs during feeding time to prevent overeating. Provided prescription drug counseling and consultation to the owner. Recommended for re-evaluation in 2 months or sooner if conditions worsen or new symptoms arise. Advise the owner to monitor the patient's appetite, water intake, and energy levels closely."
  // }
  // let summary = await extractSummaryFromAudioTranscript(text.text, defaultNotesTemplate, null)
  // summary.visit = summaryListToBullet(summary.visit)
  // res.send(summary)
})

async function getAllAppointments() {
  return await prisma.appointment.findMany()
}

async function updateAppointment(appointmentId, updatedNotes) {
  return await prisma.appointment.update({
    where: {
      id: appointmentId,
    },
    data: {
      notes: updatedNotes,
    },
  })
}

async function updatePhysicalExamInAppointments() {
  // Assuming `findAllAppointments` is a function that fetches all appointments from your database
  const appointments = await getAllAppointments()
  for (let appointment of appointments) {
    if (
      appointment.notes?.physical_exam 
    ) {
      // Convert the physical_exam dictionary to a string
      appointment.notes.physical_exam = physicalExamDictToString(
        appointment.notes.physical_exam
      )

      // Assuming `updateAppointment` is a function that updates an appointment in your database
      // You need to pass the appointment's ID and the fields to be updated
      await updateAppointment(appointment.id, appointment.notes)
    }
  }
}

function physicalExamDictToString(physicalExam) {
  let result = ''
  for (const [key, value] of Object.entries(physicalExam)) {
    result += `${key}: ${value}\n`
  }
  return result.trim() // Trim the trailing newline character
}

// router.get('/organizations', async (req, res) => {
//   const organizations = await prisma.organization.findMany();
//   res.json(organizations);
// });


// router.post('/organizations/:orgId/veterinarians', async (req, res) => {
//   const orgId = parseInt(req.params.orgId);
//   const { name, licenseNumber } = req.body;
  
//   try {
//     const veterinarian = await prisma.veterinarian.create({
//       data: {
//         name,
//         licenseNumber,
//         organizationId: orgId
//       }
//     });
//     res.json(veterinarian);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });


router.post('/query/pet', async (req, res) => {
  const googleId = req.auth?.sub;

  try{
    await pinecone.init({      
      environment: "gcp-starter",      
      apiKey: process.env.PINECONE_API_KEY,      
    });  
  }catch(err){
    console.log(err)
    res.send(err)
  }
  index = pinecone.Index('vet-assist')
  let searchQuery = req.body.search
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: searchQuery,
  });
  const searchQueryEmbedding = response.data[0].embedding
  const queryRequest = {
    vector: searchQueryEmbedding,
    topK: 5,
    includeMetadata: true,
    namespace: req.body.namespace
  }
  const queryResponse = await index.query({ queryRequest })
  references = queryResponse.matches?.filter(obj => obj.metadata !== undefined).map(obj => obj.metadata.chunkText);
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-16k",
    messages: [{"role": "system", "content": `You are a veterinary assistant who answers ${req.body.namespace}'s parents questions using medical history references provided. Here are the medical history references ${references}. If the references are not related to the question do not use outside information to answer the question just say I cannot find the answer to the question.`}, {role: "user", content: searchQuery}],
  });
  queryResponse.matches?.forEach((file, index) => {
    file.s3BucketUrl = getSignedUrl(file.metadata.bucketName, file.metadata.uploadKey);
    file.metadata.title = `Source ${index + 1}`;
  });
  res.send({
    question: req.body.search,
    summary: completion.choices[0].message.content,
    references: queryResponse.matches,
  })
});



function createSummaryPdf(fileName, summary, pet, appointmentDate) {
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(fileName)
  doc.pipe(stream);

  doc.fontSize(16).text('Veterinary Visit Report for ' + pet.name, { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Date: ${new Date(appointmentDate).toLocaleDateString()}`, { align: 'right' });
  doc.moveDown();

  addSection(doc, "History", summary.history);
  addPhysicalExamSection(doc, "Physical Exam", summary.physical_exam);

  const sections = ["assessment", "plan", "client_communications"];
  sections.forEach(section => {
    addSection(doc, section.charAt(0).toUpperCase() + section.slice(1), summary[section]);
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(fileName));
    stream.on('error', reject);
  });
}

function addSection(doc, title, items) {
  doc.fontSize(14).fillColor('black').text(title, { underline: true });
  doc.fontSize(12).fillColor('black');
  items.forEach(item => {
    doc.text(`- ${item}`);
  });
  doc.moveDown();
}

function addPhysicalExamSection(doc, title, exam) {
  doc.fontSize(14).fillColor('black').text(title, { underline: true });
  doc.fontSize(12).fillColor('black');

  // Iterate through the object and print each key-value pair
  for (const [key, value] of Object.entries(exam)) {
    doc.text(`${key}: ${value}`);
  }

  doc.moveDown();
}

async function extractTextWithFontInfo(url) {
  const pdf = await pdfjsLib.getDocument(url).promise;
  const textItems = [];

  for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();

      for (const item of text.items) {
          textItems.push({
              text: item.str,
              fontSize: item.height,
              fontName: item.fontName
          });
      }
  }
  console.log(textItems)
  return textItems;
}

function isBold(fontName) {
const boldDescriptors = ['Bold', 'Bd', 'B', 'Heavy'];
return boldDescriptors.some(descriptor => fontName.includes(descriptor));
}

function processTextItems(textItems) {
for (const item of textItems) {
    if (isBold(item.fontName)) {
        console.log(`Bold Text: ${item.text}`);
    }
    //     console.log(`Regular Text: ${item.text}`);
    // }
}
}

function formatNotes(notes) {
  let formattedText = '';

  for (const [key, value] of Object.entries(notes)) {
    formattedText += `${key.toUpperCase()}:\n`;
    if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // Recursive call for nested objects
      formattedText += formatNotes(value) + '\n';
    } else {
      // Directly append the value if it's not an object
      formattedText += `${value}\n`;
    }
    formattedText += '\n'; // Add a newline for spacing between sections
  }

  return formattedText.trim(); // Trim the final string to remove any trailing newlines
}

module.exports = router;

(BigInt.prototype).toJSON = function() {
  return this.toString();
};

require('dotenv').config();
const express = require('express');
const organizationRoutes = require('./routes/organization');
const appointmentRoutes = require('./routes/appointment')
const clientRoutes = require('./routes/clients')
const petRoutes = require('./routes/pets')
const phoneRoutes = require('./routes/phone')
const scheduleRoutes = require('./routes/schedule')
const callRoutes = require('./routes/call')
const leadsRoutes = require('./routes/leads')
const meetingWebhookRoutes = require('./routes/meetingWebhook')
const calenderRoutes = require('./routes/calender')
const calenderWebhookRoutes = require('./routes/calenderWebhook')
const schedule = require('node-schedule')
const prisma = require('@prisma/client').PrismaClient
const app = express();
const port = process.env.PORT;
const cors = require('cors');
const routes = require('./routes')
const admin = require('firebase-admin')
const clientScheduleService = require('./services/clientScheduleService')
const { cleanUpPhoneNumber } = require('./utils/checkInUtils')
const jwtDecode = require('jsonwebtoken').decode
const { leadsCallScheduler, campaignScheduler } = require('./services/leadsService')
const { renewMSCalendarSubscription } = require('./utils/microsoftUtils')
const talkingPointRoutes = require('./routes/talkingPoint')
const contextRoutes = require('./routes/context')
const analyticsRoutes = require('./routes/analyticsRoutes')
const gohighlevelRoutes = require('./routes/gohighlevel')
process.env.TZ = 'UTC'

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
}

admin.initializeApp(firebaseConfig)

const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const { webhook } = require('twilio/lib/webhooks/webhooks');
const auth0Issuer = process.env.AUTH0_ISSUER_BASE_URL
const audience = [
  'https://coachally.ai',
  'https://coachally.us.auth0.com/userinfo',
  process.env.FIREBASE_PROJECT_ID
]

const firebaseIssuer = `https://securetoken.google.com/${process.env.FIREBASE_PROJECT_ID}`
const firebaseJwksUri = `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`

const checkJwt = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] // Assuming Bearer token
  if (!token) {
    return res.status(401).send('Authorization token required')
  }
  
  
  let decodedToken
  try {
    decodedToken = jwtDecode(token, { complete: true })
  } catch (error) {
    console.log(error)
    return res.status(400).send('Invalid token')
  }

  const issuer = decodedToken.payload.iss

  if (issuer === auth0Issuer) {
    jwt({
      secret: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        // jwksUri: `${auth0Issuer}/.well-known/jwks.json`,
        jwksUri: `${auth0Issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
      }),
      audience: audience,
      issuer: auth0Issuer,
      algorithms: ['RS256'],
    })(req, res, next)
  } else if (issuer === firebaseIssuer) {
    admin
      .auth()
      .verifyIdToken(token)
      .then(decodedToken => {
        if (
          decodedToken &&
          decodedToken.iss &&
          decodedToken.iss.includes('securetoken.google.com')
        ) {
          if (
            decodedToken.firebase &&
            decodedToken.firebase.identities &&
            decodedToken.firebase.identities['google.com']
          ) {
            let authSub =
              'google-oauth2|' +
              decodedToken.firebase.identities['google.com'][0]
            decodedToken.sub = authSub
          }
        }
        // Attach the modified decoded token to req.auth for downstream use
        req.auth = decodedToken
        next()
      })
      .catch(error => {
        res.status(401).send('Unauthorized')
      })
  } else {
    res.status(401).send('Unknown issuer')
  }
}

// Move CORS configuration to the top, before other middleware
const allowedOrigins = [process.env.FE_URL, 'http://127.0.0.1:5500'];

app.use(cors({
    origin: function(origin, callback) {
        // Check if origin is in allowedOrigins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 204
}));

// Add headers middleware
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Credentials', 'true');
    next();
});
// app.use(checkJwt);
app.use(express.json()); // Middleware to parse request body

// Use our routes
// app.use('/api', routes)
app.use('/phone/api', phoneRoutes)
app.use('/api', gohighlevelRoutes)
app.use('/api', checkJwt, organizationRoutes);
app.use('/api', checkJwt, appointmentRoutes)
app.use('/api', checkJwt, clientRoutes)
app.use('/api', checkJwt, petRoutes)
app.use('/api', checkJwt, callRoutes)
app.use('/api', checkJwt, scheduleRoutes)
// app.use('/zoom/api', callRoutes) // not requiring auth for now for testing
app.use('/meeting', meetingWebhookRoutes)
app.use('/apii', checkJwt, calenderRoutes)
// app.use('/calender', calenderWebhookRoutes)
app.use('/api/leads', checkJwt, leadsRoutes)
app.use('/api', checkJwt, talkingPointRoutes)
app.use('/api', checkJwt, contextRoutes )
app.use('/api', checkJwt, analyticsRoutes)
app.use('/.well-known/microsoft-identity-association.json', (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  
  const msIdentityData = {
    "associatedApplications": [
      {
        "applicationId": "b77fd4ce-657c-4521-a11a-64e67f282847"
      }
    ]
  };
  
  res.json(msIdentityData);
});


app.listen(port, "0.0.0.0", () => {
  console.log(`App listening at ${port}`);
});

const prismaClient = new prisma()

async function scheduleClientCheckIns() {
  console.log("Inside schedule client")
  const clients = await prismaClient.client.findMany({
    where: {
      checkInTime: {
        not: null,
      },
      checkInEnabled: true,
    },
  });

  console.log(clients)

  clients.forEach(client => {
    const { checkInTime, id, phone } = client
    clientScheduleService.scheduleClientCheckIn(id, checkInTime, cleanUpPhoneNumber(phone))
  })
}

scheduleClientCheckIns()

// for the recurring leads scheduler

// leadsCallScheduler()

// schedule.scheduleJob('5 0 * * *', function() {
//   leadsCallScheduler();
// });

// schedule.scheduleJob('*/1 * * * *', function () {
//   campaignScheduler()
// })

// renew old subscription to microsoft calendar at 2300 daily
// schedule.scheduleJob('0 23 * * *', async function () {
//   try {
//     const allSubscriptionsWithExpiration = await prismaClient.microsoftCalendarSubscription.findMany({
//       where: {
//         expirationDateTime: {
//           lte: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expiring within the next 24 hours
//         },
//       },
//     });

//     for (const subscription of allSubscriptionsWithExpiration) {
//       const result = await renewMSCalendarSubscription(subscription.webHookId, 6);

//       prisma.calendar.update({
//         where: { id: subscription.id },
//         data: {
//           webhookId: result.id,
//           webHookExpiresAt: new Date(result.expirationDateTime),
//         },
//       })
//     }
//   } catch (error) {
//     console.error('Error renewing subscriptions:', error);
//   }
// });

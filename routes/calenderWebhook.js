const express = require('express')
const router = express.Router()
const calenderController = require('../controllers/calenderController')
const fileUpload = require('express-fileupload')


router.use(fileUpload())

router.post(
  '/microsoft/webhook',
  calenderController.addMicrosoftCalenderWebhook
)

router.get(
  '/microsoft/webhook',
  (req, res) => {
    const validationToken = req.query.validationToken;
    
    if (validationToken) {
        console.log('Webhook validation request received (GET)');
        return res.status(200).send(validationToken);
    }
    
    res.status(200).send('Microsoft Calendar Webhook is active')
  }
)

router.post(
  '/calender/microsoft/new',
  calenderController.addMicrosoftCalenderWebhook2
)
module.exports = router 
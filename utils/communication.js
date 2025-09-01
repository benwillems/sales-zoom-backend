const sgMail = require('@sendgrid/mail')

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

function sendEmail(emailBody, emailSubject, clientEmail, fromEmail='chughes@sasquatchstrength.com') {
  return new Promise((resolve, reject) => {
    const msg = {
      to: clientEmail,
      from: fromEmail,
      subject: emailSubject,
      html: `<html><head><style>
              body {
                font-family: Arial, sans-serif;
              }
              .email-content {
                white-space: pre-wrap;
              }
            </style></head><body><div class="email-content">${emailBody}</div></body></html>`,
      text: emailBody.replace(/<[^>]*>?/gm, ''), // Remove HTML tags for plain text version
    }

    sgMail
      .send(msg)
      .then(() => {
        console.log('Email sent')
        resolve()
      })
      .catch(error => {
        console.error('SendGrid error:', error)
        reject(error)
      })
  })
}

module.exports = { sendEmail }

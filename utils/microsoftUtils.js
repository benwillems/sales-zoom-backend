const fetch = require('node-fetch')

const getMSAuthToken = async () => {
  const tenantId = process.env.MICROSOFT_TENANT_ID
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  // const formdata = new FormData();
  // formdata.append("grant_type", "client_credentials");
  // formdata.append("client_id", clientId);
  // formdata.append("client_secret", clientSecret);
  // formdata.append("scope", "https://graph.microsoft.com/.default");
  const body = new URLSearchParams({
    "grant_type": "client_credentials",
    "client_id": clientId,
    "client_secret": clientSecret,
    "scope": "https://graph.microsoft.com/.default",
  });

  // console.log('formdata')
  // console.log(formdata)
  console.log('url')
  console.log(url)
  console.log('body')
  console.log(body.toString())
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    // Log raw JSON if there’s an error
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      console.error("Non-JSON response from /token:", text);
      throw new Error("Unexpected response from token endpoint");
    }

    if (!response.ok) {
      // e.g. payload = { error: "...", error_description: "..." }
      console.error("Azure /token error ▶", payload);
      throw new Error(
        `Error fetching token: ${payload.error_description || payload.error}`
      );
    }

    return payload.access_token;

  } catch (error) {
    console.error('Error in getMSAuthToken:', error)
    throw error
  }
}

// https://graph.microsoft.com/v1.0/me/calendarview?startdatetime=2025-06-01T06:27:11.772Z&enddatetime=2025-06-08T06:27:11.772Z

const getAllMSEventsForNextYear = async (MSUserId, startDate) => {
  const accessToken = await getMSAuthToken()
  let endDate = new Date(startDate)
  endDate.setFullYear(endDate.getFullYear() + 1)

  const url = `https://graph.microsoft.com/v1.0/users/${MSUserId}/calendarview?startdatetime=${startDate.toISOString()}&enddatetime=${endDate.toISOString()}`
  
  console.log('url')
  console.log(url)
  console.log('accessToken')
  console.log(accessToken)
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`Error fetching events: ${response.statusText}`)
    }

    const data = await response.json()
    console.log('events data')
    console.log(data)
    return data
  } catch (error) {
    console.error('Error in getAllMSEventsForNextYear:', error)
    throw error
  }
}

const subscribeToMSCalendar = async (MSUserId, notificationUrl, subscriptionDurationDays = 4) => {
  const accessToken = await getMSAuthToken()
  
  // Calculate expiration date (4 days from now)
  const expirationDateTime = new Date()
  expirationDateTime.setDate(expirationDateTime.getDate() + subscriptionDurationDays)
  
  const subscriptionPayload = {
    changeType: "created,updated,deleted",
    notificationUrl: notificationUrl,
    resource: `users/${MSUserId}/events`,
    expirationDateTime: expirationDateTime.toISOString(),
    clientState: "secretClientValue" // Optional: for validation
  }

  const url = "https://graph.microsoft.com/v1.0/subscriptions"
  
  console.log('Creating subscription for user:', MSUserId)
  console.log('Subscription payload:', JSON.stringify(subscriptionPayload, null, 2))
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscriptionPayload)
    })

    const text = await response.text()
    let data
    
    try {
      data = JSON.parse(text)
    } catch {
      console.error("Non-JSON response from subscriptions:", text)
      throw new Error("Unexpected response from subscriptions endpoint")
    }

    if (!response.ok) {
      console.error("Subscription creation error:", data)
      throw new Error(`Error creating subscription: ${data.error?.message || response.statusText}`)
    }

    console.log('Subscription created successfully:', data)
    return data
    
  } catch (error) {
    console.error('Error in subscribeToMSCalendar:', error)
    throw error
  }
}

const renewMSCalendarSubscription = async (subscriptionId, additionalDays = 4) => {
  const accessToken = await getMSAuthToken()
  
  // Calculate new expiration date
  const expirationDateTime = new Date()
  expirationDateTime.setDate(expirationDateTime.getDate() + additionalDays)
  
  const renewPayload = {
    expirationDateTime: expirationDateTime.toISOString()
  }

  const url = `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`
  
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(renewPayload)
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Error renewing subscription: ${errorData.error?.message || response.statusText}`)
    }

    const data = await response.json()
    console.log('Subscription renewed successfully:', data)
    return data
    
  } catch (error) {
    console.error('Error in renewMSCalendarSubscription:', error)
    throw error
  }
}

const deleteMSCalendarSubscription = async (subscriptionId) => {
  const accessToken = await getMSAuthToken()
  
  const url = `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`
  
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(`Error deleting subscription: ${errorData.error?.message || response.statusText}`)
    }

    console.log('Subscription deleted successfully')
    return true
    
  } catch (error) {
    console.error('Error in deleteMSCalendarSubscription:', error)
    throw error
  }
}

const getCalendarEvent = async (eventPath) => {
  const graphUrl = `https://graph.microsoft.com/v1.0/${eventPath}`
  const accessToken = await getMSAuthToken()

  try {
    const response = await fetch(graphUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Error fetching calendar event: ${response.statusText}`)
    }

    const eventData = await response.json()
    console.log('Calendar event data:', eventData)
    return eventData
  } catch (error) {
    console.error('Error in getCalendarEvent:', error)
    throw error
  }
}

module.exports = {
  getMSAuthToken,
  getAllMSEventsForNextYear,
  subscribeToMSCalendar,
  renewMSCalendarSubscription,
  deleteMSCalendarSubscription,
  getCalendarEvent,
}

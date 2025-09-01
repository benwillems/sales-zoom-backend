const { json } = require('express');
const { HttpError } = require('../errors/HttpError')
const { makeAgentCall, getCalendarAvailability, bookMeeting, addCallResult, fetchAllLeads, makeAgentCallOnNewContact, createTemplate, fetchAllTemplates, setDefaultTemplate, stopLeads, startLeads, removeDefaultTemplate, fetchPipelinesByLocation, searchOpportunities, startCampaign, addCallCampaignResult } = require('../services/leadsService')

const { parseBoolean } = require('../utils/audioAppointmentUtils');

exports.makeAgentCall = async (req, res) => {
  const { clientName, phoneNumber, email, programs } = req.body
  try {
    const call = await makeAgentCall({
      clientName,
      phoneNumber,
      email,
      programs,
    })
    res.status(200).send()
  } catch (error) {
    console.error('Error making call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.makeAgentCallOnNewContact = async (req, res) => {
  const { contact_id, location, full_name, phone, email, customData, tags } = req.body
  try {
    const call = await makeAgentCallOnNewContact({
      contactId: contact_id,
      locationId: location?.id,
      name: full_name,
      email: email,
      phone: phone,
      calendarId: customData.calendarId,
      tags: tags
    })
    return res.status(200).send()
  } catch (error) {
    console.error('Error making call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.fetchAllLeads = async (req, res) => {
  try {
    const leads = await fetchAllLeads()
    res.status(200).json(leads)
  } catch (error) {
    console.error('Error making call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.addCallResult = async (req, res) => {
  try {
    const call = await addCallResult(req.body)
    res.status(200).send()
  } catch (error) {
    console.error('Error adding call result: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.addCallCampaignResult = async (req, res) => {
  try {
    const call = await addCallCampaignResult(req.body)
    res.status(200).send()
  } catch (error) {
    console.error('Error adding campaign call result: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.getCalendarAvailability = async (req, res) => {
  try {
    const { startDateTime, endDateTime, callId } = req.body
    console.log("Get calendar availability: ", req.body)
    const slots = await getCalendarAvailability(
      callId,
      startDateTime,
      endDateTime)
    res.status(200).json(slots)
  } catch (error) {
    console.error('Error making call: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.bookMeeting = async (req, res) => {
  try {
    const { slot, callId } = req.body
    const slotBooked = await bookMeeting(slot, callId)
    res.status(200).json(slotBooked)
  } catch (error) {
    console.error('Error booking meeting: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.createTemplate = async (req, res) => {
  try {
    const { 
      name,
      body,
    } = req.body;
    
    
    const template = await createTemplate({
      name: name,
      body: body,
    });

    res.status(200).json(template)
  } catch (error) {
    console.error('Error creating template: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.fetchAllTemplates = async (req, res) => {
  try {
    const templates = await fetchAllTemplates()
    res.status(200).json(templates)
  } catch (error) {
    console.error('Error fetching templates: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.setDefaultTemplate = async (req, res) => {
  try {
    const { templateId } = req.params
    const template = await setDefaultTemplate({
      templateId: parseInt(templateId)
    })
    res.status(200).json(template)
  } catch (error) {
    console.error('Error setting default template: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.stopLeads = async (req, res) => {
  try {
    const { leadId } = req.params
    const lead = await stopLeads({
      leadId: parseInt(leadId)
    })
    res.status(200).json(lead)
  } catch (error) {
    console.error('Error stopping leads: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.startLeads = async (req, res) => {
  try {
    const { leadId } = req.params
    const lead = await startLeads({
      leadId: parseInt(leadId)
    })
    res.status(200).json(lead)
  } catch (error) {
    console.error('Error starting leads: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.removeDefaultTemplate = async (req, res) => {
  try {
    const template = await removeDefaultTemplate()
    res.status(200).json(template)
  } catch (error) {
    console.error('Error removing default template: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.fetchPipelines = async (req, res) => {
  try {
    const { locationId } = req.params
    const pipelines = await fetchPipelinesByLocation(locationId)
    return res.json(pipelines)
  } catch (error) {
    console.error('Error fetching pipelines: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.searchOpportunities = async (req, res) => {
  try {
    const { locationId, pipelineStageId, startAfter, startAfterId } = req.params
    const opportunities = await searchOpportunities(
      pipelineStageId,
      locationId,
      startAfter,
      startAfterId
    )
    return res.json(opportunities)
  } catch (error) {
    console.error('Error searching opportunities: ', error.message)
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    return res.status(500).send({ message: 'Internal Server Error' })
  }
}

exports.startCampaign = async (req, res) => {
  try {
    const {
      name,
      opportunities,
      pipelineId,
      pipelineStageId,
      calendarId,
      locationId,
    } = req.body

    // Validate required fields
    if (
      !name ||
      !opportunities ||
      !pipelineId ||
      !pipelineStageId ||
      !calendarId ||
      !locationId
    ) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'All fields are required to start a campaign',
      })
    }

    // Validate opportunities is an array and not empty
    if (!Array.isArray(opportunities) || opportunities.length === 0) {
      return res.status(400).json({
        error: 'Invalid opportunities',
        message: 'Opportunities must be a non-empty array',
      })
    }
    const campaign = await startCampaign(
      name,
      opportunities,
      pipelineId,
      pipelineStageId,
      calendarId,
      locationId
    )
    return res.json({'details': "Campaign created"})
  } catch (error) {
    console.error('Error starting campaign:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message || 'Failed to start campaign',
    })
  }
}

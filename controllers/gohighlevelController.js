const {
  createContact,
  updateAppointment,
  updateAppointmentOpportunity
} = require('../services/gohighlevelService')

exports.createContactAndAppointment = async (req, res) => {
  try {
    const { contact_id } = req.body

    console.log('Create contact and appointment for contact_id:', contact_id)
    // Create a new contact in GoHighLevel
    const contactResponse = await createContact(contact_id)
    if (!contactResponse) {
      return res.status(500).json({ error: 'Failed to create contact' })
    }
    return res.status(200).json({
      message: 'Contact and appointment created successfully',
      response: contactResponse
    })
  } catch (error) {
    console.error('Error creating contact and appointment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

exports.updateAppointment = async (req, res) => {
  try {
    const body = req.body

    const { contact_id, customData } = body
    
    console.log('Update appointment for contact_id:', contact_id)
    // Update the appointment in GoHighLevel
    await updateAppointment(contact_id, customData)
    return res.status(200).json({
      message: 'Appointment updated successfully'
    })
  } catch (error) {
    console.error('Error updating appointment:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

exports.opportunityStatusUpdate = async (req, res) => {
  try {
    console.log('Opportunity status update request body:', req.body)
    await updateAppointmentOpportunity(req.body)
    return res.status(200).json({
      message: 'Opportunity status updated successfully'
    })
  } catch (error) {
    console.error('Error updating opportunity status:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

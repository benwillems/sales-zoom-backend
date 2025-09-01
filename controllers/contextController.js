// controllers/contextController.js

const { HttpError, NotFoundError } = require('../errors/HttpError');
const {
  listContexts,
  updateContext,
  updateDefaultContext,
} = require('../services/contextService');

// GET /context/list
exports.getContexts = async (req, res) => {
  const authSub = req.auth?.sub;
  if (!authSub) return res.status(401).json({ error: 'Unauthenticated' });

  try {
    const result = await listContexts({ authSub });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error listing contexts:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// PATCH /context/:id/update
exports.patchContext = async (req, res) => {
  const authSub = req.auth?.sub;
  const contextId = parseInt(req.params.id, 10);
  const { contextText } = req.body;

  if (!authSub) return res.status(401).json({ error: 'Unauthenticated' });
  if (!contextText) return res.status(400).json({ error: 'contextText is required' });

  try {
    const updated = await updateContext({ authSub, contextId, contextText });
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating context:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// PATCH /default-context/:id/update
exports.patchDefaultContext = async (req, res) => {
  const authSub = req.auth?.sub;
  const defaultContextId = parseInt(req.params.id, 10);
  const { contextText } = req.body;

  if (!authSub) return res.status(401).json({ error: 'Unauthenticated' });
  if (!contextText) return res.status(400).json({ error: 'contextText is required' });

  try {
    const updated = await updateDefaultContext({ authSub, defaultContextId, contextText });
    return res.status(200).json(updated);
  } catch (error) {
    console.error('Error updating default context:', error);
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
    this.name = 'HttpError'
  }
}

class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

class BadRequestError extends HttpError {
  constructor(message = 'Bad request') {
    super(400, message)
    this.name = 'BadRequestError'
  }
}

class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message) // 403 is the HTTP status code for Forbidden errors
    this.name = 'ForbiddenError'
  }
}

// Export custom errors
module.exports = {
  HttpError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
}

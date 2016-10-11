'use strict';

class DivvyError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    this.message = message;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = (new Error(message)).stack;
    }
  }
}

/** Received message was malformed. */
class MalformedMessageError extends DivvyError {
}

/** A message was received for an unknown command. */
class UnknownCommandError extends DivvyError {
}

module.exports = {
  DivvyError: DivvyError,
  MalformedMessageError: MalformedMessageError,
  UnknownCommandError: UnknownCommandError
};
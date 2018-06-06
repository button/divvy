const Errors = require('./errors');

const WHITESPACE = /\s/;
const UNQUOTED_TERMINALS = /[\s=]/;

const Utils = {
  invariant: (item, message) => {
    if (!item) {
      throw new Error(message);
    }
  },

  /**
   * Reads a divvy-style string, that is one which is optionally surrounded
   * by double-quotes. A quoted string must terminate at the next quote
   * mark; an unquoted string terminates at an equals sign, whitespace, or
   * the end of the string (whichever comes first).
   *
   * The return value is an object containing `value` (the extracted
   * string) and `remain` (the remaining unparsed portion of
   * `inputString`, if any).
   */
  readString: (inputString) => {
    if (!inputString || inputString.length === 0) {
      return { value: '', remain: '' };
    }

    if (inputString[0] === '"') {
      const innerStr = inputString.slice(1);
      const endingQuote = innerStr.indexOf('"');
      if (endingQuote < 0) {
        throw new Errors.MalformedMessageError('Unexpected end of quoted string.');
      }
      return {
        value: innerStr.slice(0, endingQuote),
        remain: inputString.slice(endingQuote + 2),
      };
    }

    const endMatch = UNQUOTED_TERMINALS.exec(inputString);
    const endPos = endMatch ? endMatch.index : inputString.length;
    return {
      value: inputString.slice(0, endPos),
      remain: inputString.slice(endPos),
    };
  },

  /**
   * Asserts that the next character in `inputString` is, or matches,
   * `charOrRegexp`, returning `inputString.slice(1)` upon success
   * and throwing an error otherwise.
   */
  consumeChar: (inputString, charOrRegexp) => {
    if (!inputString || !inputString.length) {
      throw new Errors.MalformedMessageError('Unexpected end of input string.');
    }

    const itMatches = charOrRegexp instanceof RegExp ?
        (charOrRegexp.test(inputString[0])) :
        (charOrRegexp === inputString[0]);

    if (!itMatches) {
      // Shortcut for friendly messages.
      let message;
      if (charOrRegexp === WHITESPACE) {
        message = 'whitespace';
      } else {
        message = `'${charOrRegexp}'`;
      }
      throw new Errors.MalformedMessageError(`Expected ${message}, found '${inputString[0]}'`);
    }

    return inputString.slice(1);
  },

  /**
   * Parses a string containing zero or more "key=value" sequences into
   * a plain object. Keys and values may be quoted strings. Throws an
   * error if a quoted string is unterminated or if the sequence is
   * otherwise malformed.
   */
  parseOperationString: (inputString) => {
    let s = inputString || '';
    s = s.trim();

    const command = {};

    while (s.length) {
      let parsed = Utils.readString(s);
      const key = parsed.value;
      s = Utils.consumeChar(parsed.remain, '=');

      parsed = Utils.readString(s);
      const value = parsed.value;
      s = parsed.remain;

      command[key] = value;

      // We've already trimmed, so we expect more command, so the next
      // character must be a whitespace.
      if (s.length) {
        s = Utils.consumeChar(s, WHITESPACE);
      }

      // Strip any additional whitespace.
      while (s.length && WHITESPACE.test(s[0])) {
        s = s.slice(1);
      }
    }

    return command;
  },

  /**
   * Parses a text string into a Divvy command. Throws an error
   * if the command is unrecognized.
   *
   * @param  {string} inputString the input string
   * @return {object}             an object containing the command name as
   *                              `command`, along with any command-specific
   *                              fields.
   */
  parseCommand: (inputString) => {
    const parsed = Utils.readString(inputString);
    const command = parsed.value.toUpperCase();
    const args = parsed.remain.trim();

    if (command === 'HIT') {
      const operation = Utils.parseOperationString(args);
      return {
        command,
        operation,
      };
    }
    throw new Errors.UnknownCommandError(`Unrecognized command: ${command}`);
  },

  stringifyObjectValues: (obj) => {
    if (obj.constructor.name !== 'Object') {
      throw new Error(`Expected object: got ${typeof obj}`);
    }
    const ret = {};
    Object.keys(obj).forEach((key) => {
      const val = obj[key];
      if (typeof val === 'string') {
        ret[key] = val;
      } else {
        ret[key] = JSON.stringify(val);
      }
    });
    return ret;
  },
};

module.exports = Utils;

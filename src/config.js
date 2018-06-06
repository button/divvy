const debug = require('debug')('divvy');
const fs = require('fs');
const ini = require('ini');
const path = require('path');

const Utils = require('./utils');

/**
 * In support of globbing, we turn the operation value into
 * a regex. We don't want to support full regex keys (we may
 * in the future, however that will be an explicit decision).
 * These characters are escaped from globbed keys before being
 * parsed into a regex ensuring that we only support globs.
 * The tl;dr of it is that it represents special regex chars
 * excluding "*".
 */
const REGEX_ESCAPE_CHARACTERS = /[-[\]{}()+?.,\\^$|#]/g;

function isGlobValue(v) {
  return v.endsWith('*');
}

class Config {
  constructor() {
    this.rules = [];
  }

  /**
   * Takes a glob rule value (e.g. /my/path/*) and creates a regex to
   * test the incoming operation value with.
   * @param {string} ruleValue The glob rule value to parse to regex.
   * @return {RegExp} The regex to test the operation value with.
   */
  static parseGlob(ruleValue) {
    ruleValue = ruleValue.replace(REGEX_ESCAPE_CHARACTERS, '\\$&');
    ruleValue = ruleValue.replace('*', '.*');
    return new RegExp(`^${ruleValue}`);
  }

  static fromJsonFile(filename) {
    const rawConfig = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    const config = new Config();

    // Add default after other rules since it has lowest precedence
    if (typeof rawConfig.default === 'object') {
      rawConfig.overrides.push(rawConfig.default);
    }

    (rawConfig.overrides || []).forEach(function (rule) {
      config.addRule(
        Utils.stringifyObjectValues(rule.operation),
        rule.creditLimit,
        rule.resetSeconds,
        rule.actorField,
        rule.comment);
    });

    return config;
  }

  static fromFile(filename) {
    switch (path.extname(filename)) {
      case '.json':
        return this.fromJsonFile(filename);
      case '.ini':
        return this.fromIniFile(filename);
      default:
        throw new Error(`Unrecognized format for config file: ${filename}`);
    }
  }

  /** Creates a new instance from an `ini` file.  */
  static fromIniFile(filename) {
    // TODO(mikey): Tests.

    const rawConfig = ini.parse(fs.readFileSync(filename, 'utf-8'));
    const config = new Config();

    for (const rulegroupString of Object.keys(rawConfig)) {
      const rulegroupConfig = rawConfig[rulegroupString];

      // These fields are required and will be validated within addRule
      const operation = Config.stringToOperation(rulegroupString);
      const creditLimit = parseInt(rulegroupConfig.creditLimit, 10);
      const resetSeconds = parseInt(rulegroupConfig.resetSeconds, 10);

      // Optional fields.
      const actorField = rulegroupConfig.actorField || '';
      const comment = rulegroupConfig.comment || '';

      config.addRule(operation, creditLimit, resetSeconds, actorField, comment);
    }

    return config;
  }

  /** Converts a string like `a=b c=d` to an operation like `{a: 'b', c: 'd'}`. */
  static stringToOperation(s) {
    const operation = {};
    if (s === 'default') {
      return operation;
    }
    for (const kv of s.split(/\s+/)) {
      const pair = kv.split('=');
      operation[pair[0]] = pair[1] || '';
    }
    return operation;
  }

  /**
   * Installs a new rule with least significant precendence (append).
   *
   * @param {Object} operation    The "operation" to be rate limited, specifically,
   *                              a map of free-form key-value pairs.
   * @param {number} creditLimit  Number of operations to permit every `resetSeconds`
   * @param {number} resetSeconds Credit renewal interval.
   * @param {string} actorField   Name of the actor field (optional).
   * @param {string} comment      Optional diagnostic name for this rule.
   */
  addRule(operation, creditLimit, resetSeconds, actorField, comment) {
    const foundRule = this.findRule(operation);

    if (foundRule !== null) {
      throw new Error(
        `Unreachable rule for operation=${operation}; masked by operation=${foundRule.operation}`);
    }

    if (isNaN(creditLimit) || creditLimit < 0) {
      throw new Error(`Invalid creditLimit for operation=${operation} (${creditLimit})`);
    }

    if (creditLimit > 0 && (isNaN(resetSeconds) || resetSeconds < 1)) {
      throw new Error(`Invalid resetSeconds for operation=${operation} (${resetSeconds})`);
    }

    const rule = {
      operation,
      creditLimit,
      resetSeconds,
      actorField,
      comment: comment || null,
    };
    this.rules.push(rule);

    debug('config: installed rule: %j', rule);
  }

  /** Returns the rule matching operation, or `null` if no match. */
  findRule(operation) {
    for (const rule of this.rules) {
      let match = true;
      for (const operationKey of Object.keys(rule.operation)) {
        const operationValue = rule.operation[operationKey];
        if (operationValue === '*') {
          match = true;
        } else if (isGlobValue(operationValue)) {
          match = Config.parseGlob(operationValue).test(operation[operationKey]);
        } else if (operationValue !== operation[operationKey]) {
          match = false;
        }

        // Skip testing additional operations if rule has already failed.
        if (!match) {
          break;
        }
      }

      if (match) {
        return rule;
      }
    }

    return null;
  }

  toJson(pretty) {
    const data = {
      overrides: [],
    };
    for (const rule of this.rules) {
      if (Object.keys(rule.operation).length === 0) {
        data.default = rule;
      } else {
        data.overrides.push(rule);
      }
    }
    return JSON.stringify(data, null, pretty && 2);
  }
}

module.exports = Config;

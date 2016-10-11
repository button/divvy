'use strict';

const debug = require('debug')('divvy');

const fs = require('fs');
const redis = require('redis');
const Bluebird = require('bluebird');
Bluebird.promisifyAll(redis.RedisClient.prototype);
Bluebird.promisifyAll(redis.Multi.prototype);

const path = require('path');
const SCRIPT_FILE = path.resolve(__dirname, '../scripts/pipe.lua');

class Backend {

  /**
   * Constructor.
   *
   * @param  {Object} options.redisClient A redis client instance. If not specified a new
   *                                      instance will be created locally.
   */
  constructor(options) {
    options = options || {};
    this.redis = options.redisClient || redis.createClient();
    this.scriptSha = null;
  }

  /**
   * Records a hit against the given bucket name and actor.
   *
   * @param  {object} operation    key/value pairs specifying operation
   * @param  {string} actor        string specifying the current actor
   * @param  {number} creditLimit  positive integer giving maximum credit
   * @param  {number} resetSeconds credit resets after this many seconds
   * @return {object}              Promise resolved with fields `isAllowed`,
   *                               `currentCredit`, and `nextResetSeconds`.
   */
  hit(operation, actor, creditLimit, resetSeconds) {
    if (!this.scriptSha) {
      return Promise.reject(new Error('hit(): Backend not initialized.'));
    }

    if (resetSeconds < 1) {
      return Promise.reject(new Error('hit(): bad value for resetSeconds'));
    }

    if (creditLimit <= 0) {
      return Promise.resolve({
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: -1
      });
    }

    const pairs = Object.keys(operation).sort().map(k => `${k}=${operation[k]}`);
    const bucketName = pairs.join(' ');

    // Incorporate creditLimit and resetSeconds into the key name, so that
    // any changes to these configuration parameters cause us to use
    // a fresh new bucket.
    const keyName = `divvy:${bucketName}:${actor}:${creditLimit}:${resetSeconds}`;

    // The lua script will set the exact value we pass, so decrement it
    // ahead of time in case it is used.
    const initialValue = creditLimit - 1;

    debug(`redis: evalsha ${this.scriptSha} 1 ${keyName} ${resetSeconds} ${initialValue}`);

    return this.redis.evalshaAsync(
        this.scriptSha, 1, keyName, resetSeconds, initialValue).then((result) => {
      if (!result || result.length !== 3) {
        throw new Error(`Unexpected result from redis: "${result}"`);
      }
      return {
        isAllowed: !!result[0],
        currentCredit: result[1],
        nextResetSeconds: result[2]
      };
    });
  }

  initialize() {
    const scriptData = fs.readFileSync(SCRIPT_FILE).toString();
    return this.redis.scriptAsync('load', scriptData).then((sha) => {
      this.scriptSha = sha;
    });
  }

}

module.exports = Backend;
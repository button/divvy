const Config = require('../src/config');
const Server = require('../src/server');
const Client = require('@button/divvy-client');
const assert = require('assert');
const sinon = require('sinon');

/**
 * Client/server tests. These tests exercise the TCP server, the TCP
 * client, and the server's interface to the backend.
 */

describe('src/server', function () {
  before(function () {
    this.clock = sinon.useFakeTimers();
  });

  after(function () {
    this.clock.restore();
  });

  describe('#serve', function () {
    let backend;
    let config;
    let server;
    let serverPort;
    let client;
    let instrumenter;

    beforeEach(function (done) {
      config = Config.fromIniFile(`${__dirname}/test-config.ini`);

      backend = {
        initialize: () => {
          return Promise.resolve();
        },

        hit: sinon.stub(),
      };

      instrumenter = {
        countHit: sinon.spy(),
        countError: sinon.spy(),
        timeHit: sinon.spy(),
        gaugeCurrentConnections: sinon.spy(),
      };

      // Create a server on port 0 (ephemeral / randomly-selected port)
      server = new Server({
        port: 0,
        config,
        backend,
        instrumenter,
      });

      // Once the server is bound, connect a client.
      server.on('listening', (address) => {
        serverPort = address.port;
        client = new Client('', serverPort);
        client.connect();
      });

      // Once the client has connected, verify connection count and finish.
      server.once('client-connected', () => {
        sinon.assert.callCount(instrumenter.gaugeCurrentConnections, 1);
        sinon.assert.calledWith(instrumenter.gaugeCurrentConnections, 1);
        done();
      });

      // Initialize backend then bind server.
      backend.initialize().then(() => {
        server.serve();
      });
    });

    it('for an operation where all params match', function (done) {
      // Mock out the response from redis; the values don't matter
      // for client/server testing purposes.
      backend.hit.onCall(0).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));

      client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      }).then((response) => {
        sinon.assert.calledWith(backend.hit, {
          method: 'GET',
          path: '/ping',
          isAuthenticated: 'true',
          ip: '*',
        }, '1.2.3.4', 100, 60);

        assert.deepEqual(response, {
          isAllowed: true,
          currentCredit: 100,
          nextResetSeconds: 60,
        });

        sinon.assert.callCount(instrumenter.countHit, 1);
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'rule', '');

        sinon.assert.callCount(instrumenter.timeHit, 1);
        // Since we've installed sinon's fake timers we can safely compare to new Date()
        // as we haven't ticked the clock
        sinon.assert.calledWith(instrumenter.timeHit, new Date());

        done();
      }).catch(done);
    });

    it('for an operation where some params match', function (done) {
      // Mock out the response from redis; the values don't matter
      // for client/server testing purposes.
      backend.hit.onCall(0).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 10,
        nextResetSeconds: 10,
      }));

      // This operation will match a config rule where "path" is ignored,
      // so we should *not* see that parameter when the operation reaches
      // the backend.
      client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'bloop',
        ip: '1.2.3.4',
      }).then((response) => {
        sinon.assert.calledWith(backend.hit,
          { method: 'GET', path: '/ping', ip: '*' }, '1.2.3.4', 10, 60);

        assert.deepEqual(response, {
          isAllowed: true,
          currentCredit: 10,
          nextResetSeconds: 10,
        });

        sinon.assert.callCount(instrumenter.countHit, 1);
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'rule', 'get-ping-by-ip');

        sinon.assert.callCount(instrumenter.timeHit, 1);
        // Since we've installed sinon's fake timers we can safely compare to new Date()
        // as we haven't ticked the clock
        sinon.assert.calledWith(instrumenter.timeHit, new Date());

        done();
      }).catch(done);
    });

    it('for an operation with no actor', function (done) {
      // Mock out the response from redis; the values don't matter
      // for client/server testing purposes.
      backend.hit.onCall(0).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 10,
        nextResetSeconds: 10,
      }));

      // This operation will match a config rule where "path" is ignored,
      // so we should *not* see that parameter when the operation reaches
      // the backend.
      client.hit({
        method: 'DELETE',
      }).then((response) => {
        sinon.assert.calledWith(backend.hit, {}, '', 1, 60);

        assert.deepEqual(response, {
          isAllowed: true,
          currentCredit: 10,
          nextResetSeconds: 10,
        });

        sinon.assert.callCount(instrumenter.countHit, 1);
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'rule', '');

        sinon.assert.callCount(instrumenter.timeHit, 1);
        // Since we've installed sinon's fake timers we can safely compare to new Date()
        // as we haven't ticked the clock
        sinon.assert.calledWith(instrumenter.timeHit, new Date());

        done();
      }).catch(done);
    });

    it('for an unknown command', function (done) {
      client._enqueueMessage('EGGPLANT not-tasty\n').promise.then(() => {
        done(new Error('Should have failed'));
      }).catch((err) => {
        assert.equal('ERR unknown-command "Unrecognized command: EGGPLANT"', err.message);

        sinon.assert.callCount(instrumenter.countError, 1);
        sinon.assert.calledWith(instrumenter.countError, 'unknown-command');

        sinon.assert.callCount(instrumenter.timeHit, 0);

        done();
      }).catch((err) => {
        done(err);
      });
    });

    it('for a malformed command', function (done) {
      // This operation will match a config rule where "path" is ignored,
      // so we should *not* see that parameter when the operation reaches
      // the backend.
      client._enqueueMessage('HIT "quoteme=123\n').promise.then(() => {
        done(new Error('Should have failed'));
      }).catch((err) => {
        assert.equal('ERR unknown "Unexpected end of quoted string."', err.message);

        sinon.assert.callCount(instrumenter.countError, 1);
        sinon.assert.calledWith(instrumenter.countError, 'unknown');

        sinon.assert.callCount(instrumenter.timeHit, 0);

        done();
      }).catch((err) => {
        done(err);
      });
    });

    it('tracks connection close', function (done) {
      server.on('client-disconnected', () => {
        sinon.assert.calledWith(instrumenter.gaugeCurrentConnections, 1);
        sinon.assert.calledWith(instrumenter.gaugeCurrentConnections, 0);
        done();
      });

      client.close();
    });

    it('tracks connections', function (done) {
      const client2 = new Client('', serverPort);
      client2.connect();

      const client3 = new Client('', serverPort);
      client3.connect();

      const client4 = new Client('', serverPort);
      client4.connect();

      let expectedConnections = 2;
      server.on('client-connected', () => {
        sinon.assert.calledWith(instrumenter.gaugeCurrentConnections, expectedConnections);
        expectedConnections++;
        if (expectedConnections === 4) {
          done();
        }
      });
    });
  });

  describe('Server.getMatchType', function () {
    it('returns none for null rules (no match)', function () {
      assert.equal('none', Server.getMatchType(null));
    });

    it('returns rule for rule matches', function () {
      assert.equal('rule', Server.getMatchType({ foo: '1' }));
      assert.equal('rule', Server.getMatchType({ foo: '1', bar: 2 }));
    });

    it('returns default for empty rule matches', function () {
      assert.equal('default', Server.getMatchType({}));
    });
  });
});

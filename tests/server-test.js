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
  beforeEach(function () {
    this.clock = sinon.useFakeTimers();
  });

  afterEach(function () {
    this.clock.restore();
  });

  describe('#serve', function () {
    let backend;
    let config;
    let server;
    let serverPort;
    let client;
    let instrumenter;
    let clients;
    let getClient;
    let close;

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

      // Get a new client, and keep track of it so we can clean up connections.
      clients = [];
      getClient = () => {
        if (!serverPort) {
          throw new Error('Cannot return client until server is bound');
        }

        const c = new Client('', serverPort);
        c.connect();

        clients.push(c);
        return c;
      };

      // Once the server is bound, connect a client.
      server.on('listening', (address) => {
        serverPort = address.port;
        client = getClient();
      });

      // Once the client has connected, verify connection count and finish.
      server.once('client-connected', () => {
        sinon.assert.callCount(instrumenter.gaugeCurrentConnections, 1);
        sinon.assert.calledWith(instrumenter.gaugeCurrentConnections, 1);
        done();
      });

      // Initialize backend then bind server.
      backend.initialize().then(() => {
        close = server.serve();
      });
    });

    afterEach(function() {
      // Close the server
      close();

      // Close the client connections
      clients.map(c => c.close());
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
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', '');

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
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'get-ping-by-ip');

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
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', '');

        sinon.assert.callCount(instrumenter.timeHit, 1);
        // Since we've installed sinon's fake timers we can safely compare to new Date()
        // as we haven't ticked the clock
        sinon.assert.calledWith(instrumenter.timeHit, new Date());

        done();
      }).catch(done);
    });

    it('for an operation that matches a passing canary rule', function () {
      backend.hit.returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));
      return client.hit({
        method: 'GET',
        path: '/ping',
        local: 'true',
        ip: '1.2.3.4',
      }).then(() => {
        sinon.assert.callCount(instrumenter.countHit, 2);
        sinon.assert.calledWith(instrumenter.countHit, 'canary-accepted', 'get-ping-by-ip-from-local');
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'get-ping-by-ip');
        sinon.assert.callCount(instrumenter.timeHit, 1);
      });
    });

    it('for an operation that matches a rejecting canary rule rule', function () {
      backend.hit.onCall(0).returns(Promise.resolve({
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: 60,
      }));
      backend.hit.onCall(1).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));

      return client.hit({
        method: 'GET',
        path: '/ping',
        local: 'true',
        ip: '1.2.3.4',
      }).then(() => {
        sinon.assert.callCount(instrumenter.countHit, 2);
        sinon.assert.calledWith(instrumenter.countHit, 'canary-rejected', 'get-ping-by-ip-from-local');
        sinon.assert.calledWith(instrumenter.countHit, 'accepted', 'get-ping-by-ip');
        sinon.assert.callCount(instrumenter.timeHit, 1);
      });
    });

    it('for concurrent commands', async function () {
      this.clock.restore();

      // Inject latency into the first backend hit
      backend.hit.onCall(0).callsFake(() => new Promise(r => setTimeout(
        () => r({ isAllowed: false, currentCredit: 0, nextResetSeconds: 60 }),
        10
      )));

      backend.hit.onCall(1).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));

      const hit1 = client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      });

      const hit2 = client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      });

      const [res1, res2] = await Promise.all([hit1, hit2]);

      assert.deepEqual(res1, {
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: 60,
      });

      assert.deepEqual(res2, {
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      });
    });

    it('for sequential commands on the same socket', async function () {
      backend.hit.onCall(0).returns(Promise.resolve({
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: 60,
      }));

      backend.hit.onCall(1).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));

      const hit1 = await client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      });

      assert.deepEqual(hit1, {
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: 60,
      });

      const hit2 = await client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      });

      assert.deepEqual(hit2, {
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      });
    });

    it('for concurrent requests on different sockets', async function() {
      // We will create two connections. On the default connection, we will
      // write to HITs, the first of which will be very slow to process, and
      // the second of which will be fast.
      //
      // Concurrently, we will send a single HIT on another connection, which
      // we expect to not wait on the other socket.
      //
      // This array will keep track of who finishes when.
      //
      const sequence = [];
      const client2 = getClient();

      await new Promise(r => client2.on('connected', r));

      this.clock.restore();

      // Inject latency into the first backend hit
      backend.hit.onCall(0).callsFake(() => new Promise(r => setTimeout(
        () => r({ isAllowed: false, currentCredit: 0, nextResetSeconds: 60 }),
        10
      )));

      backend.hit.onCall(1).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      }));

      backend.hit.onCall(2).returns(Promise.resolve({
        isAllowed: true,
        currentCredit: 200,
        nextResetSeconds: 60,
      }));

      const hit1 = client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      }).then((r) => { sequence.push('socket 1; hit 1'); return r; });

      const hit2 = client.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      }).then((r) => { sequence.push('socket 1; hit 2'); return r; });

      const hit3 = client2.hit({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      }).then((r) => { sequence.push('socket 2; hit 1'); return r; });

      const [res1, res2, res3] = await Promise.all([hit1, hit2, hit3]);

      assert.deepEqual(res1, {
        isAllowed: false,
        currentCredit: 0,
        nextResetSeconds: 60,
      });

      assert.deepEqual(res2, {
        isAllowed: true,
        currentCredit: 100,
        nextResetSeconds: 60,
      });

      assert.deepEqual(res3, {
        isAllowed: true,
        currentCredit: 200,
        nextResetSeconds: 60,
      });

      assert.deepEqual(sequence, [
        'socket 2; hit 1',
        'socket 1; hit 1',
        'socket 1; hit 2',
      ]);
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
      getClient();
      getClient();
      getClient();

      let expectedConnections = 1;
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

const assert = require('assert');
const sinon = require('sinon');

const { Dispatcher, ok, error } = require('../src/dispatcher');

describe('src/dispatcher', function() {
  beforeEach(function() {
    this.conn = {
      write: sinon.spy(),
      destroy: sinon.spy(),
      writable: true,
    };

    this.handler = l => new Promise(r => setTimeout(() => r(ok(l)), parseInt(l, 10)));

    this.dispatcher = new Dispatcher({
      conn: this.conn,
      handler: this.handler,
    });
  });

  it('requires a valid connection and handler function', function() {
    assert.throws(
      () => new Dispatcher(),
      /^Error: Must provide conn to Dispatcher$/
    );

    assert.throws(
      () => new Dispatcher({ conn: this.conn }),
      /^Error: Must provide handler function to Dispatcher$/
    );

    assert.throws(
      () => new Dispatcher({ conn: this.conn, handler: 'bloop' }),
      /^Error: Must provide handler function to Dispatcher$/
    );
  });

  it('handles a single request', async function() {
    await this.dispatcher.handle('1');

    assert.deepStrictEqual(this.conn.write.args, [['OK 1\n']]);
    assert.deepStrictEqual(this.conn.destroy.callCount, 0);
  });

  it('handles many requests with varying processing time', async function() {
    // Dispatch an initial request that will have a latency greater than all
    // others. Use the returned promise to synchronize with flushing responses.
    const sync = this.dispatcher.handle('100');
    for (let i = 90; i >= 0; i -= 10) {
      this.dispatcher.handle(`${i}`);
    }

    await sync;

    assert.deepStrictEqual(this.conn.write.args, [
      ['OK 100\n'],
      ['OK 90\n'],
      ['OK 80\n'],
      ['OK 70\n'],
      ['OK 60\n'],
      ['OK 50\n'],
      ['OK 40\n'],
      ['OK 30\n'],
      ['OK 20\n'],
      ['OK 10\n'],
      ['OK 0\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 0);
  });

  it('handles multiple flush cycles', async function() {
    let sync = this.dispatcher.handle('20');
    this.dispatcher.handle('0');

    await sync;

    sync = this.dispatcher.handle('1');
    this.dispatcher.handle('21');

    await sync;

    assert.deepStrictEqual(this.conn.write.args, [
      ['OK 20\n'],
      ['OK 0\n'],
      ['OK 1\n'],
      ['OK 21\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 0);
  });

  it('handles handler functions that return an error', async function() {
    const handler = () => error(`doh`);
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('yeet?');

    assert.deepStrictEqual(this.conn.write.args, [['ERR doh\n']]);
    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that dont return a promise', async function() {
    const handler = l => ok(`${l} yeet`);
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('yeet?');

    assert.deepStrictEqual(this.conn.write.args, [['OK yeet? yeet\n']]);
    assert.deepStrictEqual(this.conn.destroy.callCount, 0);
  });

  it('handles handler functions that synchronously throw', async function() {
    const handler = l => { throw new Error(`${l}`); };
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('yeet?');

    assert.deepStrictEqual(this.conn.write.args, [['ERR Internal Error: yeet?\n']]);
    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that reject', async function() {
    const handler = l => Promise.reject(new Error(`all-american ${l}`));
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('reject');

    assert.deepStrictEqual(this.conn.write.args, [['ERR Internal Error: all-american reject\n']]);
    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles mixed rejections and destroys the socket after the first', async function() {
    const handler = l => new Promise((res, rej) => setTimeout(
      () => (parseInt(l, 10) % 2 === 0 ? res(ok(l)) : rej(new Error(l))),
      parseInt(l, 10)
    ));

    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    const sync = dispatcher.handle('10');
    dispatcher.handle('7');

    await sync;

    assert.deepStrictEqual(this.conn.write.args, [
      ['OK 10\n'],
      ['ERR Internal Error: 7\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that return an invalid value', async function() {
    const handler = () => Promise.resolve('spuds mackenzie');
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('best pup');

    assert.deepStrictEqual(this.conn.write.args, [
      ['ERR Internal Error: Unknown status (undefined)\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that return an unknown status', async function() {
    const handler = () => Promise.resolve({ status: 'SPUDS', message: 'MACKENZIE' });
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('best pup');

    assert.deepStrictEqual(this.conn.write.args, [
      ['ERR Internal Error: Unknown status (SPUDS)\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that return an invalid message type', async function() {
    const handler = () => Promise.resolve(ok(23));
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('best pup');

    assert.deepStrictEqual(this.conn.write.args, [
      ['ERR Internal Error: Invalid message type (number)\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles handler functions that return an invalid message', async function() {
    const handler = () => Promise.resolve(ok('everyone\nwalk\nthe\ndinosaur'));
    const dispatcher = new Dispatcher({ conn: this.conn, handler });

    await dispatcher.handle('best pup');

    assert.deepStrictEqual(this.conn.write.args, [
      ['ERR Internal Error: Message contained newlines\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });

  it('handles destroyed sockets', async function() {
    await this.dispatcher.handle('10');

    assert.deepStrictEqual(this.conn.write.args, [
      ['OK 10\n'],
    ]);

    this.conn.writable = false;
    await this.dispatcher.handle('10');

    assert.deepStrictEqual(this.conn.write.args, [
      ['OK 10\n'],
    ]);

    assert.deepStrictEqual(this.conn.destroy.callCount, 1);
  });
});

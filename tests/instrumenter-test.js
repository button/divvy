const assert = require('assert');
const PrometheusClient = require('prom-client');
const sinon = require('sinon');

const Instrumenter = require('../src/instrumenter');

describe('src/instrumenter', function () {
  before(function () {
    this.clock = sinon.useFakeTimers();
  });

  after(function () {
    this.clock.restore();
  });

  beforeEach(function () {
    // Reset the prometheus register so we don't get errors for
    // re-creating our metrics.
    PrometheusClient.register.clear();

    // Not providing options will cause statsd to default to a mock
    // implementation.
    this.instrumenter = new Instrumenter({});

    // Use spies for statsd assertions; for Prometheus we can just read
    // from the registry.
    this.instrumenter.statsd.increment = sinon.spy();
    this.instrumenter.statsd.gauge = sinon.spy();
    this.instrumenter.statsd.timing = sinon.spy();
  });

  it('gauges the number of current connections', function () {
    sinon.assert.notCalled(this.instrumenter.statsd.gauge);
    assert.equal(this.instrumenter.tcpConnectionsCounter.hashMap[''].value, 0);

    this.instrumenter.gaugeCurrentConnections(50);
    sinon.assert.calledWith(this.instrumenter.statsd.gauge, 'connections', 50);
    assert.equal(this.instrumenter.tcpConnectionsCounter.hashMap[''].value, 50);

    this.instrumenter.gaugeCurrentConnections(20);
    sinon.assert.calledWith(this.instrumenter.statsd.gauge, 'connections', 20);
    assert.equal(this.instrumenter.tcpConnectionsCounter.hashMap[''].value, 20);
  });

  it('records the duration of a HIT', function () {
     // Grab a start date and move forward a second so we have some imaginary duration
    const start = new Date();
    this.clock.tick(1000);

    sinon.assert.notCalled(this.instrumenter.statsd.timing);
    assert.equal(this.instrumenter.hitDurationHistogram.hashMap[''].sum, 0);
    assert.equal(this.instrumenter.hitDurationHistogram.hashMap[''].count, 0);

    this.instrumenter.timeHit(start);
    sinon.assert.callCount(this.instrumenter.statsd.timing, 1);
    sinon.assert.calledWith(this.instrumenter.statsd.timing, 'hit', start);
    assert.equal(this.instrumenter.hitDurationHistogram.hashMap[''].sum, 1);
    assert.equal(this.instrumenter.hitDurationHistogram.hashMap[''].count, 1);
  });

  it('records the number of HIT operations', function () {
    sinon.assert.notCalled(this.instrumenter.statsd.increment);
    assert.deepEqual(this.instrumenter.hitCounter.hashMap, {});

    this.instrumenter.countHit('accepted', 'rule');
    this.instrumenter.countHit('accepted', 'rule');
    this.instrumenter.countHit('accepted', 'none');
    this.instrumenter.countHit('accepted', 'default');
    this.instrumenter.countHit('rejected', 'none');

    sinon.assert.callCount(this.instrumenter.statsd.increment, 10);
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.accepted');
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.rejected');
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.accepted.rule');
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.accepted.none');
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.accepted.default');
    sinon.assert.calledWith(this.instrumenter.statsd.increment, 'hit.rejected.none');

    assert.equal(this.instrumenter.hitCounter.hashMap['status:accepted,type:rule'].value, 2);
    assert.equal(this.instrumenter.hitCounter.hashMap['status:accepted,type:none'].value, 1);
    assert.equal(this.instrumenter.hitCounter.hashMap['status:accepted,type:default'].value, 1);
    assert.equal(this.instrumenter.hitCounter.hashMap['status:rejected,type:none'].value, 1);
  });
});

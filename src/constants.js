// Shared constants.

module.exports = {
  // "stop" is the default policy the server will take when
  // a rule is matched. It will test and decrement quota, publish
  // metrics, and return an accept or reject protocol response.
  MATCH_POLICY_STOP: 'stop',

  // "canary" is a special policy which can be specified for a rule.
  // When a canary rule matches, quota will be tested and decremented,
  // and metrics will be published as usual, but the server will
  // continue rule evaluation rather than return a protocol response.
  // It is used for testing new rules without taking action based on them.
  MATCH_POLICY_CANARY: 'canary',

  METRICS_STATUS_ACCEPTED: 'accepted',
  METRICS_STATUS_REJECTED: 'rejected',
  METRICS_STATUS_CANARY_ACCEPTED: 'canary-accepted',
  METRICS_STATUS_CANARY_REJECTED: 'canary-rejected',
};

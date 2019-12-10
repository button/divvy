const Config = require('../src/config');
const assert = require('assert-diff');

describe('src/config', function () {
  ['ini', 'json'].forEach(function (ext) {
    let config;

    beforeEach(function () {
      config = Config.fromFile(`${__dirname}/test-config.${ext}`);
    });

    describe(`${ext}: #addRule and #findRule`, function () {
      it('for normal rules', function () {
        let rule;

        [rule] = config.findRules({
          method: 'GET',
          path: '/ping',
          isAuthenticated: 'true',
          ip: '1.2.3.4',
        });
        assert.deepStrictEqual({
          operation: {
            method: 'GET',
            path: '/ping',
            isAuthenticated: 'true',
            ip: '*',
          },
          creditLimit: 100,
          resetSeconds: 60,
          actorField: 'ip',
          matchPolicy: 'stop',
          label: null,
          comment: '100 rpm for /ping for authenticated users, by ip',
        }, rule);

        [rule] = config.findRules({
          method: 'GET',
          path: '/ping',
          isAuthenticated: 'nope',
          ip: '1.2.3.4',
        });
        assert.deepStrictEqual({
          operation: {
            method: 'GET',
            path: '/ping',
            ip: '*',
          },
          creditLimit: 10,
          resetSeconds: 60,
          actorField: 'ip',
          matchPolicy: 'stop',
          label: 'get-ping-by-ip',
          comment: '10 rpm for /ping for non-authenticated users, by ip',
        }, rule);

        [rule] = config.findRules({
          method: 'POST',
          path: '/blort',
          isAuthenticated: 'nope',
          ip: '1.2.3.4',
        });
        assert.deepStrictEqual({
          operation: {
            method: 'POST',
            ip: '*',
          },
          creditLimit: 5,
          resetSeconds: 60,
          actorField: 'ip',
          matchPolicy: 'stop',
          label: 'post-by-ip',
          comment: '5 rpm for any POST, by ip',
        }, rule);

        [rule] = config.findRules({
          method: 'blah',
        });
        assert.deepStrictEqual({
          operation: {},
          creditLimit: 1,
          resetSeconds: 60,
          actorField: null,
          matchPolicy: 'stop',
          label: null,
          comment: 'Default quota',
        }, rule);
      });

      it('with an unreachable rule', function () {
        const config = new Config();

        config.addRule({ operation: { service: 'myservice', method: 'GET' }, creditLimit: 100, resetSeconds: 60 });
        config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: 10, resetSeconds: 20 });
        config.addRule({ operation: { service: 'myservice' }, creditLimit: 1, resetSeconds: 600 });

        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: 100, resetSeconds: 60 });
        }, /Unreachable rule/);
      });

      it('with a rule containing an invalid creditLimit', function () {
        const config = new Config();
        config.addRule({ operation: { service: 'myservice', method: 'GET' }, creditLimit: 0, resetSeconds: 60 });
        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: -1, resetSeconds: 60 });
        }, /Invalid creditLimit/);
        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'PATCH' }, creditLimit: 'seven', resetSeconds: 60 });
        }, /Invalid creditLimit/);
      });

      it('with a rule containing an invalid label', function () {
        const config = new Config();
        config.addRule({
          operation: { service: 'myservice', method: 'GET' },
          creditLimit: 0,
          resetSeconds: 60,
          label: 'nice-rule',
        });
        assert.throws(() => {
          config.addRule({
            operation: { service: 'myservice', method: 'POST' },
            creditLimit: 0,
            resetSeconds: 60,
            label: 'this is fine',
          });
        }, /Invalid rule label "this is fine"/);
      });

      it('with a rule containing a duplicate label', function () {
        const config = new Config();
        config.addRule({
          operation: { service: 'myservice', method: 'GET' }, creditLimit: 0, resetSeconds: 60, label: 'nice-rule',
        });
        assert.throws(() => {
          config.addRule({
            operation: { service: 'myservice', method: 'POST' }, creditLimit: 0, resetSeconds: 60, label: 'nice-rule',
          });
        }, /A rule with label "nice-rule" already exists/);
      });

      it('with a rule where resetSeconds < 1', function () {
        const config = new Config();
        config.addRule({ operation: { service: 'myservice', method: 'GET' }, creditLimit: 20, resetSeconds: 1 });
        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: 70, resetSeconds: 0 });
        }, /Invalid resetSeconds/);
        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: 70, resetSeconds: -20 });
        }, /Invalid resetSeconds/);
        assert.throws(() => {
          config.addRule({ operation: { service: 'myservice', method: 'POST' }, creditLimit: 10, resetSeconds: 'fish' });
        }, /Invalid resetSeconds/);
      });

      it('handles simple glob keys', function () {
        const config = new Config();

        config.addRule({
          operation: { service: 'my*', method: 'GET' }, creditLimit: 100, resetSeconds: 60, actorField: 'actor', label: 'rule-a', comment: 'a',
        });
        config.addRule({
          operation: { service: 'your*', method: 'GET' }, creditLimit: 200, resetSeconds: 40, actorField: 'jim', label: 'rule-b', comment: 'b',
        });

        const rule = config.findRules({ service: 'myget', method: 'GET' })[0];
        assert.deepStrictEqual({
          operation: {
            method: 'GET',
            service: 'my*',
          },
          creditLimit: 100,
          resetSeconds: 60,
          actorField: 'actor',
          matchPolicy: 'stop',
          label: 'rule-a',
          comment: 'a',
        }, rule);

        const other = config.findRules({ service: 'yourtest', method: 'GET' })[0];
        assert.deepStrictEqual({
          operation: {
            method: 'GET',
            service: 'your*',
          },
          creditLimit: 200,
          resetSeconds: 40,
          actorField: 'jim',
          matchPolicy: 'stop',
          label: 'rule-b',
          comment: 'b',
        }, other);
      });

      it('with a glob key proceeded by normal key', function () {
        let rule = config.findRules({
          method: 'POST',
          path: '/accounts/logout',
          isAuthenticated: 'true',
          ip: '1.2.3.4',
        })[0];
        assert.deepStrictEqual({
          operation: {
            method: 'POST',
            path: '/account*',
            isAuthenticated: 'true',
            ip: '*',
          },
          creditLimit: 1,
          resetSeconds: 60,
          actorField: 'ip',
          matchPolicy: 'stop',
          label: null,
          comment: '1 rpm for POST /account*, by ip',
        }, rule);

        [rule] = config.findRules({
          method: 'POST',
          path: '/accounts/logout',
          isAuthenticated: 'nope', // must cause a different rule to match
          ip: '1.2.3.4',
        });
        assert.deepStrictEqual({
          operation: {
            method: 'POST',
            ip: '*',
          },
          creditLimit: 5,
          resetSeconds: 60,
          actorField: 'ip',
          matchPolicy: 'stop',
          label: 'post-by-ip',
          comment: '5 rpm for any POST, by ip',
        }, rule);
      });

      it('with a canary rule', function () {
        const rules = config.findRules({
          method: 'GET',
          path: '/ping',
          local: 'true',
          ip: '1.2.3.4',
        });
        assert.equal(2, rules.length);
        assert.deepStrictEqual([
          {
            operation: {
              method: 'GET',
              path: '/ping',
              local: 'true',
            },
            creditLimit: 100,
            resetSeconds: 60,
            matchPolicy: 'canary',
            actorField: null,
            label: 'get-ping-by-ip-from-local',
            comment: 'canary: 100 rpm for /ping for local users',
          },
          {
            operation: {
              method: 'GET',
              path: '/ping',
              ip: '*',
            },
            creditLimit: 10,
            resetSeconds: 60,
            actorField: 'ip',
            matchPolicy: 'stop',
            label: 'get-ping-by-ip',
            comment: '10 rpm for /ping for non-authenticated users, by ip',
          },
        ], rules);
      });
    });
  });

  describe('#parseGlob', function () {
    it('returns a simple regex', function () {
      assert.equal('/^pages\\/.*/', Config.parseGlob('pages/*').toString());
    });

    it('escapes hyphens', function () {
      assert.equal('/^my\\-name\\-is\\-jim/', Config.parseGlob('my-name-is-jim'));
    });

    it('escapes brackets', function () {
      assert.equal('/^array\\[index\\]/', Config.parseGlob('array[index]'));
    });

    it('escapes braces', function () {
      assert.equal('/^struct\\{2\\}/', Config.parseGlob('struct{2}'));
    });

    it('escapes parens', function () {
      assert.equal('/^john\\(jacob\\)/', Config.parseGlob('john(jacob)'));
    });

    it('escapes plus signs', function () {
      assert.equal('/^me\\+you/', Config.parseGlob('me+you'));
    });

    it('escapes question marks', function () {
      assert.equal('/^ronburgundy\\?/', Config.parseGlob('ronburgundy?'));
    });

    it('escapes periods', function () {
      assert.equal('/^slim\\.shady/', Config.parseGlob('slim.shady'));
    });

    it('escapes commas', function () {
      assert.equal('/^comma\\, splice/', Config.parseGlob('comma, splice'));
    });

    it('escapes carats', function () {
      assert.equal('/^10\\^20/', Config.parseGlob('10^20'));
    });

    it('escapes dollar signs', function () {
      assert.equal('/^\\$250/', Config.parseGlob('$250'));
    });

    it('escapes pipes', function () {
      assert.equal('/^wall\\|wall/', Config.parseGlob('wall|wall'));
    });

    it('escapes octothorpes', function () {
      assert.equal('/^\\# TODO/', Config.parseGlob('# TODO'));
    });
  });
});

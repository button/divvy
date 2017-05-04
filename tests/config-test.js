

const Config = require('../src/config');
const assert = require('assert-diff');

describe('src/config', function () {
  let config;

  beforeEach(function () {
    config = Config.fromIniFile(`${__dirname}/test-config.ini`);
  });

  describe('#addRule and #findRule', function () {
    it('for normal rules', function () {
      let rule;
      rule = config.findRule({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'true',
        ip: '1.2.3.4',
      });
      assert.deepEqual({
        operation: {
          method: 'GET',
          path: '/ping',
          isAuthenticated: 'true',
          ip: '*',
        },
        creditLimit: 100,
        resetSeconds: 60,
        actorField: 'ip',
        comment: '100 rpm for /ping for authenticated users, by ip',
      }, rule);

      rule = config.findRule({
        method: 'GET',
        path: '/ping',
        isAuthenticated: 'nope',
        ip: '1.2.3.4',
      });
      assert.deepEqual({
        operation: {
          method: 'GET',
          path: '/ping',
          ip: '*',
        },
        creditLimit: 10,
        resetSeconds: 60,
        actorField: 'ip',
        comment: '10 rpm for /ping for non-authenticated users, by ip',
      }, rule);

      rule = config.findRule({
        method: 'POST',
        path: '/blort',
        isAuthenticated: 'nope',
        ip: '1.2.3.4',
      });
      assert.deepEqual({
        operation: {
          method: 'POST',
          ip: '*',
        },
        creditLimit: 5,
        resetSeconds: 60,
        actorField: 'ip',
        comment: '5 rpm for any POST, by ip',
      }, rule);

      rule = config.findRule({
        method: 'blah',
      });
      assert.deepEqual({
        operation: {},
        creditLimit: 1,
        resetSeconds: 60,
        actorField: '',
        comment: 'Default quota',
      }, rule);
    });

    it('with an unreachable rule', function () {
      const config = new Config();

      config.addRule({ service: 'myservice', method: 'GET' }, 100, 60);
      config.addRule({ service: 'myservice', method: 'POST' }, 10, 20);
      config.addRule({ service: 'myservice' }, 1, 600);

      assert.throws(() => {
        config.addRule({ service: 'myservice', method: 'POST' }, 100, 60);
      }, /Unreachable rule/);
    });

    it('handles simple glob keys', function () {
      const config = new Config();

      config.addRule({ service: 'my*', method: 'GET' }, 100, 60, 'actor', 'a');
      config.addRule({ service: 'your*', method: 'GET' }, 200, 40, 'jim', 'b');

      const rule = config.findRule({ service: 'myget', method: 'GET' });
      assert.deepEqual({
        operation: {
          method: 'GET',
          service: 'my*',
        },
        creditLimit: 100,
        resetSeconds: 60,
        actorField: 'actor',
        comment: 'a',
      }, rule);

      const other = config.findRule({ service: 'yourtest', method: 'GET' });
      assert.deepEqual({
        operation: {
          method: 'GET',
          service: 'your*',
        },
        creditLimit: 200,
        resetSeconds: 40,
        actorField: 'jim',
        comment: 'b',
      }, other);
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

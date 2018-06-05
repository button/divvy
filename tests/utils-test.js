const Utils = require('../src/utils');
const assert = require('assert');

describe('src/utils', function () {
  describe('#readString', function () {
    it('for valid strings', function () {
      assert.deepEqual({
        value: 'hello',
        remain: '=world',
      }, Utils.readString('hello=world'));

      assert.deepEqual({
        value: 'hello',
        remain: '=world',
      }, Utils.readString('"hello"=world'));

      assert.deepEqual({
        value: 'hello',
        remain: '=world',
      }, Utils.readString('"hello"=world'));

      assert.deepEqual({
        value: '',
        remain: '=world',
      }, Utils.readString('""=world'));

      assert.deepEqual({
        value: 'hello',
        remain: '',
      }, Utils.readString('hello'));

      assert.deepEqual({
        value: 'hello',
        remain: '',
      }, Utils.readString('"hello"'));

      assert.deepEqual({
        value: '',
        remain: '',
      }, Utils.readString(''));

      assert.deepEqual({
        value: '',
        remain: '',
      }, Utils.readString('""'));

      assert.deepEqual({
        value: '',
        remain: '',
      }, Utils.readString(null));
    });

    it('for invalid strings', function () {
      assert.throws(() => Utils.readString('"quote going nowhere'),
        /Unexpected end of quoted string/);
    });
  });

  describe('#consumeChar', function () {
    it('finds expected char', function () {
      assert.equal('YO', Utils.consumeChar('BYO', 'B'));
      assert.equal('', Utils.consumeChar('O', 'O'));
    });

    it('errors when missing', function () {
      assert.throws(() => Utils.consumeChar('XXX', 'Y'), /Expected 'Y', found 'X'/);
    });
  });

  describe('#parseOperationString', function () {
    it('for well-formed strings', function () {
      assert.deepEqual({
        goodnight: 'room',
      }, Utils.parseOperationString('goodnight=room'));

      assert.deepEqual({
        goodnight: 'room',
      }, Utils.parseOperationString('   goodnight=room  '));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon',
      }, Utils.parseOperationString('goodbye=moon goodnight=room'));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon',
      }, Utils.parseOperationString('\t \tgoodbye=moon\t\t goodnight=room\t\t'));

      assert.deepEqual({
        goodnight: 'room',
      }, Utils.parseOperationString('"goodnight"=room'));

      assert.deepEqual({
        goodnight: 'r o o m',
      }, Utils.parseOperationString('"goodnight"="r o o m" '));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon',
      }, Utils.parseOperationString('goodbye="moon" "goodnight"=room'));
    });

    it('for malformed strings', function () {
      assert.throws(() => Utils.parseOperationString('goodbye=" ... '),
        /Unexpected end of quoted string/);

      assert.throws(() => Utils.parseOperationString('"goodbye=yolo'),
        /Unexpected end of quoted string/);

      assert.throws(() => Utils.parseOperationString('goodbye room'),
        /Expected '=', found ' '/);

      assert.throws(() => Utils.parseOperationString('goodnight="room"ba'),
        /Expected whitespace, found 'b'/);
    });
  });

  describe('#parseCommand', function () {
    describe('HIT', function () {
      it('with an empty operation', function () {
        assert.deepEqual({
          command: 'HIT',
          operation: {},
        }, Utils.parseCommand('HIT'));

        assert.deepEqual({
          command: 'HIT',
          operation: {},
        }, Utils.parseCommand('HIT      '));
      });

      it('with a simple operation', function () {
        assert.deepEqual({
          command: 'HIT',
          operation: { hand: '20' },
        }, Utils.parseCommand('HIT hand=20'));

        assert.deepEqual({
          command: 'HIT',
          operation: { hand: '20' },
        }, Utils.parseCommand('HIT "hand"="20"   '));
      });
    });

    describe('UNKNOWN', function () {
      it('throws an error', function () {
        assert.throws(() => Utils.parseCommand('UNKNOWN bla=bla'),
          /Unrecognized command: UNKNOWN/);
      });
    });
  });

  describe('#stringifyObjectValues', function () {
    it('throws errors on non-object inputs', function () {
      [1, 'a', ['foo'], function () {}].forEach(function (val) {
        it(`throws for ${val}`, function () {
          assert.throws(() => Utils.stringifyObjectValues(val));
        });
      });
    });

    it('returns a copy of input with stringified values', function () {
      assert.deepEqual(
        { foo: '1', bar: 'a' },
        Utils.stringifyObjectValues({ foo: 1, bar: 'a' }));

      assert.deepEqual(
        { obj: JSON.stringify({ key1: 'val1' }) },
        Utils.stringifyObjectValues({ obj: { key1: 'val1' } }));
    });
  });
});

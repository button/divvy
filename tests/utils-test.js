'use strict';

const Utils = require('../src/utils');
const assert = require('assert');

describe('src/utils', () => {

  describe('#readString', () => {
    it('for valid strings', () => {
      assert.deepEqual({
        value: 'hello',
        remain: '=world'
      }, Utils.readString('hello=world'));

      assert.deepEqual({
        value: 'hello',
        remain: '=world'
      }, Utils.readString('"hello"=world'));

      assert.deepEqual({
        value: 'hello',
        remain: '=world'
      }, Utils.readString('"hello"=world'));

      assert.deepEqual({
        value: '',
        remain: '=world'
      }, Utils.readString('""=world'));

      assert.deepEqual({
        value: 'hello',
        remain: ''
      }, Utils.readString('hello'));

      assert.deepEqual({
        value: 'hello',
        remain: ''
      }, Utils.readString('"hello"'));

      assert.deepEqual({
        value: '',
        remain: ''
      }, Utils.readString(''));

      assert.deepEqual({
        value: '',
        remain: ''
      }, Utils.readString('""'));

      assert.deepEqual({
        value: '',
        remain: ''
      }, Utils.readString(null));
    });

    it('for invalid strings', () => {
      assert.throws(() => Utils.readString('"quote going nowhere'),
        /Unexpected end of quoted string/);
    });
  });

  describe('#consumeChar', () => {
    it('finds expected char', () => {
      assert.equal('YO', Utils.consumeChar('BYO', 'B'));
      assert.equal('', Utils.consumeChar('O', 'O'));
    });

    it('errors when missing', () => {
      assert.throws(() => Utils.consumeChar('XXX', 'Y'), /Expected 'Y', found 'X'/);
    });
  });

  describe('#parseOperationString', () => {
    it('for well-formed strings', () => {
      assert.deepEqual({
        goodnight: 'room'
      }, Utils.parseOperationString('goodnight=room'));

      assert.deepEqual({
        goodnight: 'room'
      }, Utils.parseOperationString('   goodnight=room  '));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon'
      }, Utils.parseOperationString('goodbye=moon goodnight=room'));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon'
      }, Utils.parseOperationString('\t \tgoodbye=moon\t\t goodnight=room\t\t'));

      assert.deepEqual({
        goodnight: 'room'
      }, Utils.parseOperationString('"goodnight"=room'));

      assert.deepEqual({
        goodnight: 'r o o m'
      }, Utils.parseOperationString('"goodnight"="r o o m" '));

      assert.deepEqual({
        goodnight: 'room',
        goodbye: 'moon'
      }, Utils.parseOperationString('goodbye="moon" "goodnight"=room'));
    });

    it('for malformed strings', () => {
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

  describe('#parseCommand', () => {

    describe('HIT', () => {
      it('with an empty operation', () => {
        assert.deepEqual({
          command: 'HIT',
          operation: {}
        }, Utils.parseCommand('HIT'));

        assert.deepEqual({
          command: 'HIT',
          operation: {}
        }, Utils.parseCommand('HIT      '));
      });

      it('with a simple operation', () => {
        assert.deepEqual({
          command: 'HIT',
          operation: { hand: '20' }
        }, Utils.parseCommand('HIT hand=20'));

        assert.deepEqual({
          command: 'HIT',
          operation: { hand: '20' }
        }, Utils.parseCommand('HIT "hand"="20"   '));
      });
    });

    describe('UNKNOWN', () => {
      it('throws an error', () => {
        assert.throws(() => Utils.parseCommand('UNKNOWN bla=bla'),
          /Unrecognized command: UNKNOWN/);
      });
    });

  });

});
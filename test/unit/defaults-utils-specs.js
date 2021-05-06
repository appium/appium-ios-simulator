import { toXmlArg, generateDefaultsCommandArgs } from '../../lib/defaults-utils';
import chai, { expect } from 'chai';

chai.should();

describe('defaults-utils', function () {

  describe('toXmlArg', function () {

    it('could properly convert simple value types to a XML representation', function () {
      for (const [actual, expected] of [
        [1, '<integer>1</integer>'],
        [1.1, '<real>1.1</real>'],
        ['1', '<string>1</string>'],
        [true, '<true/>'],
        [false, '<false/>'],
      ]) {
        toXmlArg(actual).should.eql(expected);
      }
    });

    it('could properly convert array value types to a XML representation', function () {
      toXmlArg([1.1, false]).should.eql('<array><real>1.1</real><false/></array>');
    });

    it('could properly convert dict value types to a XML representation', function () {
      toXmlArg({k1: true, k2: {k3: 1.1, k4: []}}).should.eql(
        '<dict><key>k1</key><true/><key>k2</key><dict><key>k3</key><real>1.1</real><key>k4</key><array/></dict></dict>');
    });

    it('fails to convert an unknown value type', function () {
      expect(() => toXmlArg(null)).to.throw;
    });

  });

  describe('generateDefaultsCommandArgs', function () {

    it('could properly generate command args for simple value types', function () {
      generateDefaultsCommandArgs({
        k1: 1,
        k2: 1.1,
        k3: '1',
        k4: true,
        k5: false,
      }).should.eql([
        ['k1', '<integer>1</integer>'],
        ['k2', '<real>1.1</real>'],
        ['k3', '<string>1</string>'],
        ['k4', '<true/>'],
        ['k5', '<false/>'],
      ]);
    });

    it('could properly generate command args for dict value types', function () {
      generateDefaultsCommandArgs({
        k1: {
          k2: {
            k3: 1,
          },
        }
      }).should.eql([
        ['k1', '-dict-add', 'k2', '<dict><key>k3</key><integer>1</integer></dict>'],
      ]);
    });

    it('could properly generate command args for value types with replacement', function () {
      generateDefaultsCommandArgs({
        AppleLanguages: ['en'],
        AppleLocale: 'en_US@calendar=gregorian',
        AppleKeyboards: ['en_US@sw=QWERTY']
      }, true).should.eql([
        ['AppleLanguages', '<array><string>en</string></array>'],
        ['AppleLocale', '<string>en_US@calendar=gregorian</string>'],
        ['AppleKeyboards', '<array><string>en_US@sw=QWERTY</string></array>'],
      ]);
    });

  });

});

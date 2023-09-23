// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import {
  toBiometricDomainComponent, killAllSimulators,
} from '../../lib/utils';
import SimulatorXcode9 from '../../lib/simulator-xcode-9';

chai.should();
chai.use(chaiAsPromised);

const XCODE_VERSION_9 = {
  versionString: '9.0',
  versionFloat: 9.0,
  major: 9,
  minor: 0,
  patch: undefined
};
const XCODE_VERSION_8 = {
  versionString: '8.2.1',
  versionFloat: 8.2,
  major: 8,
  minor: 2,
  patch: 1
};
const XCODE_VERSION_6 = {
  versionString: '6.1.1',
  versionFloat: 6.1,
  major: 6,
  minor: 1,
  patch: 1
};


describe('util', function () {
  let execStub;
  let xcodeMock;

  beforeEach(function () {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
  });
  afterEach(function () {
    execStub.restore();
    xcodeMock.restore();
  });

  describe('killAllSimulators', function () {
    it('should call exec if pgrep does not find any running Simulator with Xcode9', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_9));
      execStub.withArgs('xcrun').returns();
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.callCount.should.equal(2);
    });
    it('should call exec if pgrep does not find any running Simulator with Xcode8', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_8));
      execStub.withArgs('xcrun').returns();
      execStub.withArgs('pgrep').throws({code: 1});

      await killAllSimulators();
      execStub.callCount.should.equal(2);
    });
  });
});

describe('Device preferences verification', function () {
  const sim = new SimulatorXcode9('1234', XCODE_VERSION_9);

  describe('for SimulatorWindowLastScale option', function () {

    it('should pass if correct', function () {
      const validValues = [0.5, 1, 1.5];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowLastScale: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = [-1, 0.0, '', 'abc', null];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowLastScale: invalidValue
        })).should.throw(Error, /is expected to be a positive float value/);
      }
    });

  });

  describe('for SimulatorWindowCenter option', function () {

    it('should pass if correct', function () {
      const validValues = ['{0,0}', '{0.0,0}', '{0,0.0}', '{-10,0}', '{0,-10}',
        '{-32.58,0}', '{0,-32.58}', '{-32.58,-32.58}'];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowCenter: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', '{}', '{,}', '{0,}', '{,0}', '{abc}', null,
        '{-10,-10', '{0. 0, 0}', '{ 0,0}', '{0, 0}'];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowCenter: invalidValue
        })).should.throw(Error, /is expected to match/);
      }
    });

  });

  describe('for SimulatorWindowOrientation option', function () {

    it('should pass if correct', function () {
      const validValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowOrientation: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'portrait', 'bla', -1];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowOrientation: invalidValue
        })).should.throw(Error, /is expected to be one of/);
      }
    });

  });

  describe('for SimulatorWindowRotationAngle option', function () {

    it('should pass if correct', function () {
      const validValues = [0, -100, 100, 1.0];
      for (const validValue of validValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowRotationAngle: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'bla', '0'];
      for (const invalidValue of invalidValues) {
        (() => sim.verifyDevicePreferences({
          SimulatorWindowRotationAngle: invalidValue
        })).should.throw(Error, /is expected to be a valid number/);
      }
    });
  });

  describe('toBiometricDomainComponent', function () {
    it('return touch id object', function () {
      toBiometricDomainComponent('touchId').should.eql('fingerTouch');
    });
    it('return face id object', function () {
      toBiometricDomainComponent('faceId').should.eql('pearl');
    });

    it('raise an error since the argument does not exist in biometric', function () {
      (function () {
        toBiometricDomainComponent('no-touchId');
      }).should.throw();
    });
  });
});

// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import B from 'bluebird';
import * as TeenProcess from 'teen_process';
import xcode from 'appium-xcode';
import {killAllSimulators, simExists} from '../../lib/utils';
import { toBiometricDomainComponent } from '../../lib/extensions/biometric';
import { verifyDevicePreferences } from '../../lib/extensions/settings';

import * as deviceUtils from '../../lib/device-utils';
import { devices } from '../assets/deviceList';
import { SimulatorXcode10 } from '../../lib/simulator-xcode-10';

chai.should();
chai.use(chaiAsPromised);

const XCODE_VERSION_10 = {
  versionString: '10.0',
  versionFloat: 10.0,
  major: 10,
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
  let getDevicesStub;

  beforeEach(function () {
    execStub = sinon.stub(TeenProcess, 'exec');
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(deviceUtils, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(function () {
    execStub.restore();
    xcodeMock.restore();
    getDevicesStub.restore();
  });

  describe('killAllSimulators', function () {
    it('should call exec if pgrep does not find any running Simulator with Xcode9', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_10));
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
    it('should call exec if pgrep does find running Simulator with Xcode6 and shutdown fails', async function () {
      xcodeMock.expects('getVersion').once().withArgs(true).returns(B.resolve(XCODE_VERSION_6));
      execStub.withArgs('pgrep').returns('0');
      execStub.withArgs('xcrun').throws();
      execStub.withArgs('pkill').returns();

      try {
        await killAllSimulators(500);
      } catch (e) {}
      execStub.callCount.should.equal(3);
    });
  });

  describe('simExists', function () {
    it('returns true if device is found', async function () {
      let results = await B.all([
        simExists('8F4A3349-3ABF-4597-953A-285C5C0FFD00'),
        simExists('7DEA409E-159A-4730-B1C6-7C18279F72B8'),
        simExists('F33783B2-9EE9-4A99-866E-E126ADBAD410'),
        simExists('DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'),
      ]);

      for (let result of results) {
        result.should.be.true;
      }
    });

    it('returns false if device is not found', async function () {
      let existence = [];
      existence.push(simExists('A94E4CD7-D412-4198-BCD4-26799672975E'));
      existence.push(simExists('asdf'));
      existence.push(simExists(4));

      let results = await B.all(existence);

      for (let result of results) {
        result.should.be.false;
      }
    });
  });

});

describe('Device preferences verification', function () {
  const sim = new SimulatorXcode10('1234', XCODE_VERSION_10);

  describe('for SimulatorWindowLastScale option', function () {

    it('should pass if correct', function () {
      const validValues = [0.5, 1, 1.5];
      for (const validValue of validValues) {
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowLastScale: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = [-1, 0.0, '', 'abc', null];
      for (const invalidValue of invalidValues) {
        (() => verifyDevicePreferences.bind(sim)({
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
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowCenter: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', '{}', '{,}', '{0,}', '{,0}', '{abc}', null,
        '{-10,-10', '{0. 0, 0}', '{ 0,0}', '{0, 0}'];
      for (const invalidValue of invalidValues) {
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowCenter: invalidValue
        })).should.throw(Error, /is expected to match/);
      }
    });

  });

  describe('for SimulatorWindowOrientation option', function () {

    it('should pass if correct', function () {
      const validValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      for (const validValue of validValues) {
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowOrientation: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'portrait', 'bla', -1];
      for (const invalidValue of invalidValues) {
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowOrientation: invalidValue
        })).should.throw(Error, /is expected to be one of/);
      }
    });

  });

  describe('for SimulatorWindowRotationAngle option', function () {

    it('should pass if correct', function () {
      const validValues = [0, -100, 100, 1.0];
      for (const validValue of validValues) {
        (() => verifyDevicePreferences.bind(sim)({
          SimulatorWindowRotationAngle: validValue
        })).should.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues = ['', null, 'bla', '0'];
      for (const invalidValue of invalidValues) {
        (() => verifyDevicePreferences.bind(sim)({
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

import sinon from 'sinon';
import esmock from 'esmock';
import {
  DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
  SIMULATOR_UI_CLIENT_BUNDLE_ID,
} from '../../lib/utils/constants.js';
import {toBiometricDomainComponent} from '../../lib/extensions/biometric.js';
import {verifyDevicePreferences} from '../../lib/extensions/settings.js';
import {use as chaiUse, expect} from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {describe, it, beforeEach, afterEach} from 'node:test';
import {devices} from './device-list.js';
import {SimulatorXcode14} from '../../lib/simulator-xcode-14.js';

chaiUse(chaiAsPromised);

const XCODE_VERSION_10 = {
  versionString: '10.0',
  versionFloat: 10.0,
  major: 10,
  minor: 0,
  patch: undefined,
};
const XCODE_VERSION_6 = {
  versionString: '6.1.1',
  versionFloat: 6.1,
  major: 6,
  minor: 1,
  patch: 1,
};
const XCODE_VERSION_27 = {
  versionString: '27.0',
  versionFloat: 27.0,
  major: 27,
  minor: 0,
  patch: undefined,
};

let currentExec: (...args: any[]) => any = async () => ({stdout: '', stderr: ''});
let currentGetVersion: (...args: any[]) => any = async () => XCODE_VERSION_10;
let currentGetDevices: (...args: any[]) => any = async () => devices;

const {killAllSimulators, simExists} = await esmock(
  '../../lib/utils/index.js',
  import.meta.url,
  {},
  {
    teen_process: {
      exec: (...args: any[]) => currentExec(...args),
    },
    'appium-xcode': {
      getVersion: (...args: any[]) => currentGetVersion(...args),
    },
    '../../lib/utils/get-devices.js': {
      getDevices: (...args: any[]) => currentGetDevices(...args),
    },
  },
);

describe('util', function () {
  let sandbox: sinon.SinonSandbox;

  let getDevicesStub: sinon.SinonStub;
  let innerExecStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    currentExec = sandbox.stub().resolves({stdout: '', stderr: ''});
    getDevicesStub = sandbox.stub().resolves(devices);
    currentGetDevices = getDevicesStub;
    currentGetVersion = sandbox.stub();
  });
  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe('killAllSimulators', function () {
    it('should use the Simulator UI client bundle id', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_10));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('xcrun').returns(undefined);
      innerExecStub
        .withArgs('lsappinfo', ['info', '-only', 'pid', SIMULATOR_UI_CLIENT_BUNDLE_ID])
        .throws({code: 1});
      currentExec = innerExecStub;
      await killAllSimulators();
      sinon.assert.calledWith(innerExecStub, 'lsappinfo', [
        'info',
        '-only',
        'pid',
        SIMULATOR_UI_CLIENT_BUNDLE_ID,
      ]);
    });
    it('should use the DeviceHub UI client bundle id', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_27));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('xcrun').returns(undefined);
      innerExecStub
        .withArgs('lsappinfo', ['info', '-only', 'pid', DEVICE_HUB_UI_CLIENT_BUNDLE_ID])
        .throws({code: 1});
      currentExec = innerExecStub;
      await killAllSimulators();
      sinon.assert.calledWith(innerExecStub, 'lsappinfo', [
        'info',
        '-only',
        'pid',
        DEVICE_HUB_UI_CLIENT_BUNDLE_ID,
      ]);
    });
    it('should kill UI client by bundle id when shutdown fails', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_6));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('xcrun').throws(new Error('xcrun failed'));
      innerExecStub
        .withArgs('lsappinfo', ['info', '-only', 'pid', SIMULATOR_UI_CLIENT_BUNDLE_ID])
        .returns({stdout: '"pid"=12345\n'});
      innerExecStub
        .withArgs('lsappinfo', ['kill', '-hard', SIMULATOR_UI_CLIENT_BUNDLE_ID])
        .returns(undefined);
      // getDevices is stubbed, so it won't call exec internally
      // The stub returns devices immediately, so waitForCondition will complete quickly
      currentExec = innerExecStub;
      try {
        await killAllSimulators(500);
      } catch {}
      sinon.assert.calledWith(innerExecStub, 'lsappinfo', [
        'info',
        '-only',
        'pid',
        SIMULATOR_UI_CLIENT_BUNDLE_ID,
      ]);
      sinon.assert.calledWith(innerExecStub, 'lsappinfo', [
        'kill',
        '-hard',
        SIMULATOR_UI_CLIENT_BUNDLE_ID,
      ]);
    });
  });

  describe('simExists', function () {
    it('returns true if device is found', async function () {
      const results = await Promise.all([
        simExists('8F4A3349-3ABF-4597-953A-285C5C0FFD00'),
        simExists('7DEA409E-159A-4730-B1C6-7C18279F72B8'),
        simExists('F33783B2-9EE9-4A99-866E-E126ADBAD410'),
        simExists('DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'),
      ]);

      for (const result of results) {
        expect(result).to.be.true;
      }
    });

    it('returns false if device is not found', async function () {
      const existence: Promise<boolean>[] = [];
      existence.push(simExists('A94E4CD7-D412-4198-BCD4-26799672975E'));
      existence.push(simExists('asdf'));
      existence.push(simExists(4 as any));

      const results = await Promise.all(existence);

      for (const result of results) {
        expect(result).to.be.false;
      }
    });
  });
});

describe('Device preferences verification', function () {
  const sim = new SimulatorXcode14('1234', XCODE_VERSION_10);

  describe('for SimulatorWindowLastScale option', function () {
    it('should pass if correct', function () {
      const validValues = [0.5, 1, 1.5];
      for (const validValue of validValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowLastScale: validValue,
          }),
        ).to.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = [-1, 0.0, '', 'abc', null];
      for (const invalidValue of invalidValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowLastScale: invalidValue,
          }),
        ).to.throw(Error, /is expected to be a positive float value/);
      }
    });
  });

  describe('for SimulatorWindowCenter option', function () {
    it('should pass if correct', function () {
      const validValues = [
        '{0,0}',
        '{0.0,0}',
        '{0,0.0}',
        '{-10,0}',
        '{0,-10}',
        '{-32.58,0}',
        '{0,-32.58}',
        '{-32.58,-32.58}',
      ];
      for (const validValue of validValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowCenter: validValue,
          }),
        ).to.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = [
        '',
        '{}',
        '{,}',
        '{0,}',
        '{,0}',
        '{abc}',
        null,
        '{-10,-10',
        '{0. 0, 0}',
        '{ 0,0}',
        '{0, 0}',
      ];
      for (const invalidValue of invalidValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowCenter: invalidValue,
          }),
        ).to.throw(Error, /is expected to match/);
      }
    });
  });

  describe('for SimulatorWindowOrientation option', function () {
    it('should pass if correct', function () {
      const validValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      for (const validValue of validValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowOrientation: validValue,
          }),
        ).to.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = ['', null, 'portrait', 'bla', -1];
      for (const invalidValue of invalidValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowOrientation: invalidValue,
          }),
        ).to.throw(Error, /is expected to be one of/);
      }
    });
  });

  describe('for SimulatorWindowRotationAngle option', function () {
    it('should pass if correct', function () {
      const validValues = [0, -100, 100, 1.0];
      for (const validValue of validValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowRotationAngle: validValue,
          }),
        ).to.not.throw();
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = ['', null, 'bla', '0'];
      for (const invalidValue of invalidValues) {
        expect(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowRotationAngle: invalidValue,
          }),
        ).to.throw(Error, /is expected to be a valid number/);
      }
    });
  });

  describe('toBiometricDomainComponent', function () {
    it('return touch id object', function () {
      expect(toBiometricDomainComponent('touchId')).to.eql('fingerTouch');
    });
    it('return face id object', function () {
      expect(toBiometricDomainComponent('faceId')).to.eql('pearl');
    });

    it('raise an error since the argument does not exist in biometric', function () {
      expect(function () {
        toBiometricDomainComponent('no-touchId');
      }).to.throw();
    });
  });
});

import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';

import * as appiumXcode from 'appium-xcode';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

import {DEVICE_HUB_UI_CLIENT_BUNDLE_ID, SIMULATOR_UI_CLIENT_BUNDLE_ID} from '../../lib/utils/constants.js';
import {devices} from './device-list.js';

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

const FAKE_UI_CLIENT_APP = '/fake/UIClient.app';

let currentExec: (...args: any[]) => any = async () => ({stdout: '', stderr: ''});
let currentGetVersion: (...args: any[]) => any = async () => XCODE_VERSION_10;
let currentGetDevices: (...args: any[]) => any = async () => devices;
let currentShutdownAllDevices: (...args: any[]) => any = async () => {};
let currentGetUiClientAppPath: (...args: any[]) => any = async () => FAKE_UI_CLIENT_APP;

mock.module('teen_process', {
  namedExports: {
    spawn: teenProcess.spawn,
    SubProcess: teenProcess.SubProcess,
    exec: (...args: any[]) => currentExec(...args),
  },
});
mock.module('appium-xcode', {
  namedExports: {
    getPath: appiumXcode.getPath,
    getClangVersion: appiumXcode.getClangVersion,
    getMaxIOSSDK: appiumXcode.getMaxIOSSDK,
    getMaxTVOSSDK: appiumXcode.getMaxTVOSSDK,
    getVersion: (...args: any[]) => currentGetVersion(...args),
  },
});
mock.module('../../lib/utils/get-devices.js', {
  namedExports: {
    getDevices: (...args: any[]) => currentGetDevices(...args),
  },
});
mock.module('../../lib/native/native-simctl.js', {
  namedExports: {
    createNativeSimctl: () => ({shutdownAllDevices: (...args: any[]) => currentShutdownAllDevices(...args)}),
  },
});
mock.module('../../lib/utils/xcode.js', {
  namedExports: {
    assertXcodeVersion: (v: unknown) => v,
    readBundleIdFromPlist: async () => null,
    getUiClientAppPath: (...args: any[]) => currentGetUiClientAppPath(...args),
  },
});

const {killAllSimulators, simExists} = await import('../../lib/utils/index.js');
const {SimulatorXcode15} = await import('../../lib/simulator-xcode-15.js');
const {verifyDevicePreferences} = await import('../../lib/extensions/settings.js');

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
    currentShutdownAllDevices = sandbox.stub().resolves();
    currentGetUiClientAppPath = sandbox.stub().resolves(FAKE_UI_CLIENT_APP);
  });
  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe('killAllSimulators', function () {
    it('should use the Simulator UI client bundle id', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_10));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('pgrep', ['-f', FAKE_UI_CLIENT_APP]).throws({code: 1});
      currentExec = innerExecStub;
      await killAllSimulators();
      sinon.assert.calledWith(currentGetUiClientAppPath as sinon.SinonStub, SIMULATOR_UI_CLIENT_BUNDLE_ID);
      sinon.assert.calledWith(innerExecStub, 'pgrep', ['-f', FAKE_UI_CLIENT_APP]);
    });
    it('should use the DeviceHub UI client bundle id', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_27));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('pgrep', ['-f', FAKE_UI_CLIENT_APP]).throws({code: 1});
      currentExec = innerExecStub;
      await killAllSimulators();
      sinon.assert.calledWith(currentGetUiClientAppPath as sinon.SinonStub, DEVICE_HUB_UI_CLIENT_BUNDLE_ID);
      sinon.assert.calledWith(innerExecStub, 'pgrep', ['-f', FAKE_UI_CLIENT_APP]);
    });
    it('should kill UI client by app path when shutdown fails', async function () {
      currentGetVersion = sandbox.stub().withArgs(true).returns(Promise.resolve(XCODE_VERSION_6));
      currentShutdownAllDevices = sandbox.stub().rejects(new Error('shutdown all failed'));
      innerExecStub = sandbox.stub();
      innerExecStub.withArgs('pgrep', ['-f', FAKE_UI_CLIENT_APP]).returns({stdout: '12345\n'});
      innerExecStub.withArgs('pkill', ['-9', '-f', FAKE_UI_CLIENT_APP]).returns(undefined);
      // getDevices is stubbed, so it won't call exec internally
      // The stub returns devices immediately, so waitForCondition will complete quickly
      currentExec = innerExecStub;
      try {
        await killAllSimulators(500);
      } catch {}
      sinon.assert.calledWith(innerExecStub, 'pgrep', ['-f', FAKE_UI_CLIENT_APP]);
      sinon.assert.calledWith(innerExecStub, 'pkill', ['-9', '-f', FAKE_UI_CLIENT_APP]);
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
        assert.strictEqual(result, true);
      }
    });

    it('returns false if device is not found', async function () {
      const existence: Promise<boolean>[] = [];
      existence.push(simExists('A94E4CD7-D412-4198-BCD4-26799672975E'));
      existence.push(simExists('asdf'));
      existence.push(simExists(4 as any));

      const results = await Promise.all(existence);

      for (const result of results) {
        assert.strictEqual(result, false);
      }
    });
  });
});

describe('Device preferences verification', function () {
  const sim = new SimulatorXcode15('1234', XCODE_VERSION_10);

  describe('for SimulatorWindowLastScale option', function () {
    it('should pass if correct', function () {
      const validValues = [0.5, 1, 1.5];
      for (const validValue of validValues) {
        assert.doesNotThrow(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowLastScale: validValue,
          }),
        );
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = [-1, 0.0, '', 'abc', null];
      for (const invalidValue of invalidValues) {
        assert.throws(
          () =>
            verifyDevicePreferences.bind(sim)({
              SimulatorWindowLastScale: invalidValue,
            }),
          /is expected to be a positive float value/,
        );
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
        assert.doesNotThrow(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowCenter: validValue,
          }),
        );
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
        assert.throws(
          () =>
            verifyDevicePreferences.bind(sim)({
              SimulatorWindowCenter: invalidValue,
            }),
          /is expected to match/,
        );
      }
    });
  });

  describe('for SimulatorWindowOrientation option', function () {
    it('should pass if correct', function () {
      const validValues = ['Portrait', 'LandscapeLeft', 'PortraitUpsideDown', 'LandscapeRight'];
      for (const validValue of validValues) {
        assert.doesNotThrow(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowOrientation: validValue,
          }),
        );
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = ['', null, 'portrait', 'bla', -1];
      for (const invalidValue of invalidValues) {
        assert.throws(
          () =>
            verifyDevicePreferences.bind(sim)({
              SimulatorWindowOrientation: invalidValue,
            }),
          /is expected to be one of/,
        );
      }
    });
  });

  describe('for SimulatorWindowRotationAngle option', function () {
    it('should pass if correct', function () {
      const validValues = [0, -100, 100, 1.0];
      for (const validValue of validValues) {
        assert.doesNotThrow(() =>
          verifyDevicePreferences.bind(sim)({
            SimulatorWindowRotationAngle: validValue,
          }),
        );
      }
    });

    it('should throw if incorrect', function () {
      const invalidValues: any[] = ['', null, 'bla', '0'];
      for (const invalidValue of invalidValues) {
        assert.throws(
          () =>
            verifyDevicePreferences.bind(sim)({
              SimulatorWindowRotationAngle: invalidValue,
            }),
          /is expected to be a valid number/,
        );
      }
    });
  });
});

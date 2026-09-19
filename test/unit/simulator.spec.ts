import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';

import {SimDeviceState} from '@appium/coresim';
import * as appiumXcode from 'appium-xcode';
import sinon from 'sinon';
import * as teenProcess from 'teen_process';

import * as xcodeUtils from '../../lib/utils/xcode.js';
import {devices} from './device-list.js';

const UDID = devices.find((d) => d.sdk === '10.0')!.udid;

/** A fake `SpawnedProcess`-shaped object that immediately reports a clean exit. */
function fakeSpawnedProcess(): any {
  const proc = new EventEmitter() as any;
  proc.stderr = new EventEmitter();
  setImmediate(() => proc.emit('exit', 0, null));
  return proc;
}

/** The `(path, options)` args `lib/native/spawn.js`'s `spawnAndWait` calls `spawnProcess` with. */
function expectedSpawn(path: string, args: string[]): [string, {arguments: string[]}] {
  return [path, {arguments: [path, ...args]}];
}

let currentExec: (...args: any[]) => any = async () => ({stdout: '', stderr: ''});
let currentGetVersion: (...args: any[]) => any = async () => ({
  major: 15,
  versionString: '15.0.0',
});
let currentAssertXcodeVersion: (...args: any[]) => any = (v: any) => v;
let currentListSimulators: (...args: any[]) => any = async () => devices;

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
mock.module('../../lib/utils/xcode.js', {
  namedExports: {
    ...xcodeUtils,
    assertXcodeVersion: (...args: any[]) => currentAssertXcodeVersion(...args),
  },
});
mock.module('../../lib/utils/list-simulators.js', {
  namedExports: {
    listSimulators: (...args: any[]) => currentListSimulators(...args),
  },
});

const {getSimulator} = await import('../../lib/simulator.js');
const {SimulatorXcode15} = await import('../../lib/simulator-xcode-15.js');
const {SimulatorXcode27} = await import('../../lib/simulator-xcode-27.js');

describe('simulator', function () {
  let sandbox: sinon.SinonSandbox;

  let assertXcodeVersionStub: sinon.SinonStub;
  let listSimulatorsStub: sinon.SinonStub;
  let getVersionStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    currentExec = sandbox.stub().resolves({stdout: '', stderr: ''});
    assertXcodeVersionStub = sandbox.stub();
    currentAssertXcodeVersion = assertXcodeVersionStub;
    listSimulatorsStub = sandbox.stub().resolves(devices);
    currentListSimulators = listSimulatorsStub;
    getVersionStub = sandbox.stub();
    getVersionStub.withArgs(true).returns(Promise.resolve({major: 15, versionString: '15.0.0'}));
    currentGetVersion = getVersionStub;
  });
  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe('getSimulator', function () {
    it('should create a simulator with default xcode version', async function () {
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const sim = await getSimulator(UDID);
      assert.strictEqual(sim.xcodeVersion, xcodeVersion);
      assert.strictEqual(sim.constructor.name, SimulatorXcode15.name);
    });

    const xcodeVersions: Array<[number, number, string, typeof SimulatorXcode15 | typeof SimulatorXcode27]> = [
      [15, 0, '15.0.0', SimulatorXcode15],
      [26, 0, '26.0.0', SimulatorXcode15],
      [27, 0, '27.0.0', SimulatorXcode27],
    ];

    for (const [major, minor, versionString, expectedXcodeClass] of xcodeVersions) {
      it(`should create an xcode ${major} simulator with xcode version ${versionString}`, async function () {
        const xcodeVersion = {major, minor, versionString};
        assertXcodeVersionStub.callsFake(() => xcodeVersion);
        const sim = await getSimulator(UDID);
        assert.strictEqual(sim.xcodeVersion, xcodeVersion);
        assert.strictEqual(sim.constructor.name, expectedXcodeClass.name);
      });
    }

    it('should throw an error if xcode version is below minimum supported', async function () {
      const xcodeVersion = {major: 10, versionString: '10.0.0'};
      assertXcodeVersionStub.callsFake(() => {
        throw new Error(
          `Tried to use an iOS simulator with xcode version ${xcodeVersion.versionString} ` +
            `but only Xcode version 15 and up are supported`,
        );
      });
      await assert.rejects(getSimulator(UDID));
    });

    it('should throw an error if xcode version does not match', async function () {
      assertXcodeVersionStub.throws();
      await assert.rejects(getSimulator(UDID));
    });

    it('should throw an error if udid does not exist', async function () {
      await assert.rejects(getSimulator('123'), /No sim found/);
    });

    it('should match a udid that differs from the listed one only by letter case, and canonicalize it', async function () {
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const sim = await getSimulator(UDID.toLowerCase());
      assert.strictEqual(sim.udid, UDID);
    });

    it('should match the device by udid case-insensitively when checkExistence is skipped', async function () {
      // With checkExistence:false there is no lookup to canonicalize against, so this exercises
      // stat()/isRunning()'s own defensive case-insensitive match against a udid that stayed
      // whatever case the caller passed in.
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const sim = await getSimulator(UDID.toLowerCase(), {checkExistence: false});
      assert.strictEqual(sim.udid, UDID.toLowerCase());

      sinon.stub((sim as InstanceType<typeof SimulatorXcode15>)._native, 'getDevices').resolves([
        {
          udid: UDID,
          name: 'iPhone 4s',
          state: SimDeviceState.Booted,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone',
          runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-10-0',
        },
      ] as any);

      assert.strictEqual(await sim.isRunning(), true);
    });

    it('should list stats for sim', async function () {
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const rawDevices = [
        {
          udid: 'F33783B2-9EE9-4A99-866E-E126ADBAD410',
          name: 'Resizable iPhone',
          state: SimDeviceState.Shutdown,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone',
          runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-11-4',
        },
        {
          udid: 'DFBC2970-9455-4FD9-BB62-9E4AE5AA6954',
          name: 'Resizable iPad',
          state: SimDeviceState.Shutdown,
          deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPad',
          runtimeIdentifier: 'com.apple.CoreSimulator.SimRuntime.iOS-11-4',
        },
      ];
      const sims = (
        await Promise.all(
          ['F33783B2-9EE9-4A99-866E-E126ADBAD410', 'DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'].map((udid) =>
            getSimulator(udid),
          ),
        )
      ).map((sim) => {
        sinon
          .stub((sim as InstanceType<typeof SimulatorXcode15>)._native, 'getDevices')
          .returns(Promise.resolve(rawDevices as any));
        return sim;
      });

      const stats = await Promise.all(sims.map((sim) => sim.stat()));
      assert.strictEqual(stats[0].state, 'Shutdown');
      assert.strictEqual(stats[0].name, 'Resizable iPhone');
      assert.strictEqual(stats[1].state, 'Shutdown');
      assert.strictEqual(stats[1].name, 'Resizable iPad');
    });
  });

  describe('getWebInspectorSocket', function () {
    const socketPath = '/private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket';
    let getWebInspectorSocketStub: sinon.SinonStub;

    beforeEach(function () {
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);
    });

    it('should find a Web Inspector socket reported by the native driver', async function () {
      const sim = await getSimulator(UDID);
      getWebInspectorSocketStub = sinon
        .stub((sim as InstanceType<typeof SimulatorXcode15>)._native, 'getWebInspectorSocket')
        .resolves(socketPath);
      assert.strictEqual(await sim.getWebInspectorSocket(), socketPath);
    });

    it('should return null when the native driver cannot find one', async function () {
      const sim = await getSimulator(UDID);
      getWebInspectorSocketStub = sinon
        .stub((sim as InstanceType<typeof SimulatorXcode15>)._native, 'getWebInspectorSocket')
        .rejects(new Error('not found'));
      assert.strictEqual(await sim.getWebInspectorSocket(), null);
    });

    it('should assign webInspectorSocket value only once', async function () {
      const sim = await getSimulator(UDID);
      getWebInspectorSocketStub = sinon
        .stub((sim as InstanceType<typeof SimulatorXcode15>)._native, 'getWebInspectorSocket')
        .resolves(socketPath);
      await sim.getWebInspectorSocket();
      await sim.getWebInspectorSocket();
      assert.strictEqual(getWebInspectorSocketStub.callCount, 1);
    });
  });

  describe('configureLocalization', function () {
    let sim: any;
    let spawnProcessSpy: sinon.SinonStub;
    beforeEach(async function () {
      const xcodeVersion = {major: 15, versionString: '15.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);
      sim = await getSimulator(UDID);
      spawnProcessSpy = sinon.stub(sim._native, 'spawnProcess').callsFake(() => fakeSpawnedProcess());
    });
    afterEach(function () {
      if (spawnProcessSpy) {
        spawnProcessSpy.reset();
      }
    });

    describe('locale', function () {
      it('should configure locale', async function () {
        const options = {locale: {name: 'en_US', calendar: 'gregorian'}};
        assert.strictEqual(await sim.configureLocalization(options), true);
        assert.deepStrictEqual(
          spawnProcessSpy.firstCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            '.GlobalPreferences.plist',
            'AppleLocale',
            '<string>en_US@calendar=gregorian</string>',
          ]),
        );
        assert.strictEqual(spawnProcessSpy.callCount, 1);
      });
    });

    describe('keyboard', function () {
      it('should configure keyboard', async function () {
        const options = {keyboard: {name: 'en_US', layout: 'QWERTY'}};
        assert.strictEqual(await sim.configureLocalization(options), true);
        assert.deepStrictEqual(
          spawnProcessSpy.firstCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            '.GlobalPreferences.plist',
            'AppleKeyboards',
            '<array><string>en_US@sw=QWERTY</string></array>',
          ]),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.secondCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            'com.apple.Preferences',
            'KeyboardsCurrentAndNext',
            '<array><string>en_US@sw=QWERTY</string></array>',
          ]),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.thirdCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            'com.apple.Preferences',
            'KeyboardLastUsed',
            '<string>en_US@sw=QWERTY</string>',
          ]),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.getCall(3).args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            'com.apple.Preferences',
            'KeyboardLastUsedForLanguage',
            '<dict><key>en_US</key><string>en_US@sw=QWERTY</string></dict>',
          ]),
        );
        assert.strictEqual(spawnProcessSpy.callCount, 4);
      });
    });

    describe('language', function () {
      const stdout = JSON.stringify({AppleLanguages: ['en']});
      beforeEach(function () {
        currentExec = sandbox.stub().callsFake(() => ({stdout}) as any);
        sandbox.stub(sim, 'getDir').callsFake(() => '');
      });

      it('should configure language and restart services', async function () {
        const options = {language: {name: 'ja'}};
        assert.strictEqual(await sim.configureLocalization(options), true);
        assert.deepStrictEqual(
          spawnProcessSpy.firstCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            '.GlobalPreferences.plist',
            'AppleLanguages',
            '<array><string>ja</string></array>',
          ]),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.secondCall.args.slice(1),
          expectedSpawn('/bin/launchctl', ['stop', 'com.apple.SpringBoard']),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.thirdCall.args.slice(1),
          expectedSpawn('/bin/launchctl', ['stop', 'com.apple.locationd']),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.getCall(3).args.slice(1),
          expectedSpawn('/bin/launchctl', ['stop', 'com.apple.tccd']),
        );
        assert.deepStrictEqual(
          spawnProcessSpy.getCall(4).args.slice(1),
          expectedSpawn('/bin/launchctl', ['stop', 'com.apple.akd']),
        );
        assert.strictEqual(spawnProcessSpy.callCount, 5);
      });

      it('should confirm skip restarting services if already applied', async function () {
        const options = {language: {name: 'en'}};
        assert.strictEqual(await sim.configureLocalization(options), true);
        assert.deepStrictEqual(
          spawnProcessSpy.firstCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            '.GlobalPreferences.plist',
            'AppleLanguages',
            '<array><string>en</string></array>',
          ]),
        );
        assert.strictEqual(spawnProcessSpy.callCount, 1);
      });

      it('should confirm skip restarting services if skipSyncUiDialogTranslation is true', async function () {
        const options = {language: {name: 'ja', skipSyncUiDialogTranslation: true}};
        assert.strictEqual(await sim.configureLocalization(options), true);
        assert.deepStrictEqual(
          spawnProcessSpy.firstCall.args.slice(1),
          expectedSpawn('/usr/bin/defaults', [
            'write',
            '.GlobalPreferences.plist',
            'AppleLanguages',
            '<array><string>ja</string></array>',
          ]),
        );
        assert.strictEqual(spawnProcessSpy.callCount, 1);
      });
    });
  });
});

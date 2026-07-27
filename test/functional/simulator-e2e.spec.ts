import assert from 'node:assert/strict';
import {describe, it, before, afterEach, beforeEach, after, type TestContext} from 'node:test';

import {retryInterval, waitForCondition} from 'asyncbox';
import {Simctl} from 'node-simctl';

import {getSimulator} from '../../lib/simulator.js';
import type {Simulator} from '../../lib/types.js';
import {killAllSimulators, MOBILE_SAFARI_BUNDLE_ID} from '../../lib/utils/index.js';
import {getUIKitCatalogPath, UICATALOG_BUNDLE_ID} from '../setup.js';
import {LONG_TIMEOUT, verifyStates} from './helpers.js';

const OS_VERSION = process.env.MOBILE_OS_VERSION || '26.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 17';

async function deleteSimulator(udid: string, version: string): Promise<void> {
  // only want to get rid of the device if it is present
  const simctl = new Simctl();
  const devices = await simctl.getDevices();
  if (!devices[version]) {
    return;
  }
  const devicePresent = devices[version].filter((device) => device.udid === udid).length > 0;
  if (devicePresent) {
    simctl.udid = udid;
    await simctl.deleteDevice();
  }
}

describe(`simulator ${OS_VERSION}`, function () {
  let simctl: Simctl;
  let customApp: string;

  before(async function () {
    customApp = await getUIKitCatalogPath();
  });

  beforeEach(async function () {
    await killAllSimulators();
    simctl = new Simctl();
    simctl.udid = await simctl.createDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION, {
      timeout: 20000,
    });
    // just need a little more space in the logs
    console.log('\n\n'); // eslint-disable-line no-console
  });
  afterEach(async function () {
    await killAllSimulators();
    if (simctl.udid) {
      await deleteSimulator(simctl.udid, OS_VERSION);
    }
  });

  it('should detect whether a simulator has been run before', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    assert.strictEqual(await sim.isFresh(), true);
    await sim.run({startupTimeout: LONG_TIMEOUT / 2});
    assert.strictEqual(await sim.isFresh(), false);
    await sim.shutdown();
    await sim.clean();
    assert.strictEqual(await sim.isFresh(), true);
  });

  it('should launch and shutdown a sim', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT / 2});
    await sim.shutdown();
    assert.strictEqual((await sim.stat()).state, 'Shutdown');
  });

  it('should be able to delete an app', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});

    // install & launch test app
    await sim.installApp(customApp);

    console.log('Application installed'); // eslint-disable-line no-console

    assert.strictEqual(await sim.isAppInstalled(UICATALOG_BUNDLE_ID), true);

    // this remains somewhat flakey
    await retryInterval(5, 1000, async () => {
      await sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true});
    });

    console.log('Application launched'); // eslint-disable-line no-console

    // Wait for application process
    await waitForCondition(async () => (await sim.ps()).some(({name}) => name === UICATALOG_BUNDLE_ID), {
      waitMs: 10000,
      intervalMs: 500,
    });

    await sim.removeApp(UICATALOG_BUNDLE_ID);

    // should not be able to launch anymore
    await assert.rejects(sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true}));

    assert.strictEqual(await sim.isAppInstalled(UICATALOG_BUNDLE_ID), false);
  });

  it('should delete a sim', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await sim.delete();
    await assert.rejects(getSimulator(simctl.udid));
  });

  it('should start a sim using the "run" method', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});

    assert.strictEqual((await sim.stat()).state, 'Booted');

    await sim.shutdown();
    assert.strictEqual((await sim.stat()).state, 'Shutdown');
  });

  it('should be able to start safari', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});
    await sim.openUrl('https://apple.com');
    assert.strictEqual(await sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID), true);
    await sim.shutdown();
  });

  it('should detect if a sim is running', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    assert.strictEqual(await sim.isRunning(), false);

    await sim.run({startupTimeout: LONG_TIMEOUT});
    assert.strictEqual(await sim.isRunning(), true);

    await sim.shutdown();
    assert.strictEqual(await sim.isRunning(), false);
  });

  it('should start the UI client', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }

    const sim = await getSimulator(simctl.udid);
    assert.strictEqual(typeof sim.uiClientBundleId, 'string');
    assert.notStrictEqual(sim.uiClientBundleId, '');

    await sim.startUIClient({startupTimeout: LONG_TIMEOUT / 2});
    await waitForCondition(async () => await sim.isUIClientRunning(), {
      waitMs: LONG_TIMEOUT / 2,
      intervalMs: 500,
    });

    const uiClientPid = await sim.getUIClientPid();
    assert.strictEqual(typeof uiClientPid, 'string');
    assert.notStrictEqual(uiClientPid, '');
    assert.strictEqual(await sim.isUIClientRunning(), true);
  });

  it('should properly start simulator in headless mode on Xcode9+', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await verifyStates(sim, false, false);

    await sim.run({
      startupTimeout: LONG_TIMEOUT,
      isHeadless: false,
    });
    await verifyStates(sim, true, true);

    await sim.run({
      startupTimeout: LONG_TIMEOUT,
      isHeadless: true,
    });
    await verifyStates(sim, true, false);

    await sim.shutdown();
    await verifyStates(sim, false, false);
  });
});

describe(`reuse an already-created already-run simulator ${OS_VERSION}`, function () {
  let sim: Simulator;

  before(async function () {
    await killAllSimulators();
    const udid = await new Simctl().createDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
    await sim.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 4000));
  });
  after(async function () {
    await killAllSimulators();
    await deleteSimulator(sim.udid, OS_VERSION);
  });

  it('should start a sim using the "run" method', async function () {
    await sim.run({startupTimeout: LONG_TIMEOUT});

    assert.strictEqual((await sim.stat()).state, 'Booted');

    await sim.shutdown();
    assert.strictEqual((await sim.stat()).state, 'Shutdown');
  });
});

describe('advanced features', function () {
  let sim: Simulator;
  let customApp: string;

  before(async function () {
    customApp = await getUIKitCatalogPath();

    await killAllSimulators();
    const udid = await new Simctl().createDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
    await sim.run({
      startupTimeout: LONG_TIMEOUT,
    });
  });
  after(async function () {
    await killAllSimulators();
    await deleteSimulator(sim.udid, OS_VERSION);
  });

  describe('custom apps', function () {
    it('should find bundle id for UIKitCatalog', async function () {
      if (!(await sim.isAppInstalled(customApp))) {
        await sim.installApp(customApp);
      }
      if (!(await sim.isAppRunning(customApp))) {
        await sim.launchApp(UICATALOG_BUNDLE_ID);
      }

      assert.deepStrictEqual(await sim.getUserInstalledBundleIdsByBundleName('UIKitCatalog'), [UICATALOG_BUNDLE_ID]);
    });

    it('should scrub custom app', async function () {
      if (!(await sim.isAppInstalled(customApp))) {
        await sim.installApp(customApp);
      }
      if (!(await sim.isAppRunning(customApp))) {
        await sim.launchApp(UICATALOG_BUNDLE_ID);
      }
      await sim.scrubApp(UICATALOG_BUNDLE_ID);
      assert.strictEqual(await sim.isAppRunning(UICATALOG_BUNDLE_ID), false);
      await sim.launchApp(UICATALOG_BUNDLE_ID);
      assert.strictEqual(await sim.isAppRunning(UICATALOG_BUNDLE_ID), true);
    });
  });

  describe('biometric (touch Id/face Id enrollment)', function () {
    it(`should properly enroll biometric to enabled state`, async function () {
      await sim.enrollBiometric(true);
      assert.strictEqual(await sim.isBiometricEnrolled(), true);
    });

    it(`should properly enroll biometric to disabled state`, async function () {
      await sim.enrollBiometric(false);
      assert.strictEqual(await sim.isBiometricEnrolled(), false);
    });
  });

  describe('configureLocalization', function () {
    it(`should properly set locale settings`, async function (ctx: TestContext) {
      if (typeof sim.configureLocalization !== 'function') {
        return ctx.skip();
      }

      assert.strictEqual(
        await sim.configureLocalization({
          language: {
            name: 'en',
          },
          locale: {
            name: 'en_US',
            calendar: 'gregorian',
          },
          keyboard: {
            name: 'en_US',
            layout: 'QWERTY',
          },
        }),
        true,
      );
    });
  });

  describe('keychains', function () {
    it('should properly backup and restore Simulator keychains', async function () {
      if (await sim.backupKeychains()) {
        assert.strictEqual(await sim.restoreKeychains(['*.db*']), true);
      }
    });

    it('should clear Simulator keychains while it is running', async function () {
      await assert.doesNotReject(sim.clearKeychains());
    });
  });

  describe(`setReduceMotion`, function () {
    it('should check accessibility reduce motion settings', async function () {
      await sim.setReduceMotion(true);
      await sim.setReduceMotion(false);
    });
  });

  describe(`setReduceTransparency`, function () {
    it('should check accessibility reduce transparency settings', async function () {
      await sim.setReduceTransparency(true);
      await sim.setReduceTransparency(false);
    });
  });

  describe(`setAutoFillPasswords`, function () {
    it('should update AutoFill Passwords settings', async function () {
      await sim.setAutoFillPasswords(true);
      await sim.setAutoFillPasswords(false);
    });
  });

  describe('Safari', function () {
    it('should scrub Safari', async function () {
      await sim.launchApp(MOBILE_SAFARI_BUNDLE_ID, {wait: true});
      await sim.scrubSafari();
      assert.strictEqual(await sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID), false);
      await sim.launchApp(MOBILE_SAFARI_BUNDLE_ID, {wait: true});
      assert.strictEqual(await sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID), true);
    });

    it('should set arbitrary preferences on Safari', async function () {
      await sim.updateSafariSettings({
        ShowTabBar: 1,
        DidImportBuiltinBookmarks: 1,
      });
    });
  });

  describe('Permission', function () {
    it('should set and get with simctrl privacy command', async function () {
      // no exceptions
      await assert.doesNotReject(sim.setPermission('com.apple.Maps', 'location', 'yes'));
      await assert.doesNotReject(sim.setPermission('com.apple.Maps', 'location', 'NO'));
      await assert.doesNotReject(sim.setPermission('com.apple.Maps', 'location', 'unset'));
      await assert.rejects(sim.setPermission('com.apple.Maps', 'location', 'unsupported'));
    });

    it('should set and get with wix command', async function () {
      await sim.setPermission('com.apple.Maps', 'contacts', 'yes');
      assert.strictEqual(await sim.getPermission('com.apple.Maps', 'contacts'), 'yes');
      await sim.setPermission('com.apple.Maps', 'contacts', 'no');
      assert.strictEqual(await sim.getPermission('com.apple.Maps', 'contacts'), 'no');

      // unset sets as 'no'
      await sim.setPermission('com.apple.Maps', 'contacts', 'yes');
      assert.strictEqual(await sim.getPermission('com.apple.Maps', 'contacts'), 'yes');
      await sim.setPermission('com.apple.Maps', 'contacts', 'unset');
      assert.strictEqual(await sim.getPermission('com.apple.Maps', 'contacts'), 'no');
    });
  });
});

describe(`multiple instances of ${OS_VERSION} simulator on Xcode9+`, function () {
  let simulatorsMapping: Record<string, any> = {};
  const DEVICES_COUNT = 2;

  before(async function () {
    await killAllSimulators();

    const simctl = new Simctl();
    for (let i = 0; i < DEVICES_COUNT; i++) {
      const udid = await simctl.createDevice(`ios-simulator_${i}_testing`, DEVICE_NAME, OS_VERSION);
      simulatorsMapping[udid] = await getSimulator(udid);
    }
  });
  after(async function () {
    try {
      const simctl = new Simctl();
      for (const udid of Object.keys(simulatorsMapping)) {
        try {
          simctl.udid = udid;
          await simctl.deleteDevice();
        } catch (err: any) {
          console.log(`Error deleting simulator '${udid}': ${err.message}`); // eslint-disable-line
        }
      }
    } finally {
      simulatorsMapping = {};
    }
  });
  beforeEach(async function () {
    await killAllSimulators();
  });
  afterEach(async function () {
    await killAllSimulators();
  });

  it(`should start multiple simulators in 'default' mode`, async function () {
    const simulators = Object.values(simulatorsMapping);

    // they all should be off
    await retryInterval(30, 1000, async function () {
      await Promise.all(simulators.map((sim) => verifyStates(sim, false, false)));
    });

    // Should be called before launching simulator
    assert.deepStrictEqual(await simulators[0].getUserInstalledBundleIdsByBundleName('UICatalog'), []);

    for (const sim of Object.values(simulatorsMapping)) {
      await sim.run({startupTimeout: LONG_TIMEOUT});
    }
    await retryInterval(30, 1000, async function () {
      await Promise.all(simulators.map((sim) => verifyStates(sim, true, true)));
    });

    for (const sim of Object.values(simulatorsMapping)) {
      await sim.shutdown();
    }
    await retryInterval(30, 1000, async function () {
      await Promise.all(simulators.map((sim) => verifyStates(sim, false, true)));
    });
  });
});

describe('getWebInspectorSocket', function () {
  let sim: Simulator;

  before(async function () {
    await killAllSimulators();
    const udid = await new Simctl().createDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
    await sim.run({
      startupTimeout: LONG_TIMEOUT,
    });
  });
  after(async function () {
    await killAllSimulators();
    await deleteSimulator(sim.udid, OS_VERSION);
  });
  it('should get a socket when appropriate', async function () {
    const socket = await sim.getWebInspectorSocket();

    assert.ok(socket);
    assert.ok(socket.includes('com.apple.launchd'));
    assert.ok(socket.includes('com.apple.webinspectord_sim.socket'));
  });
  describe('two simulators', function () {
    let sim2: Simulator;

    before(async function () {
      const udid = await new Simctl().createDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION);
      sim2 = await getSimulator(udid);
      await sim2.run({
        startupTimeout: LONG_TIMEOUT,
      });
    });
    after(async function () {
      await killAllSimulators();
      if (sim2 && sim2.udid) {
        await deleteSimulator(sim2.udid, OS_VERSION);
      }
    });
    it('should not confuse two different simulators', async function () {
      const socket = await sim.getWebInspectorSocket();
      assert.ok(socket);

      const socket2 = await sim2.getWebInspectorSocket();
      assert.ok(socket2);

      assert.notStrictEqual(socket, socket2);
    });
    it('should always get the same socket', async function () {
      let socket = await sim.getWebInspectorSocket();
      for (let i = 0; i < 10; i++) {
        sim._webInspectorSocket = null;
        const socket2 = await sim.getWebInspectorSocket();
        assert.strictEqual(socket, socket2);
        socket = socket2;
      }
    });
  });
});

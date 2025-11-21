// transpile:mocha
import _ from 'lodash';
import { killAllSimulators, MOBILE_SAFARI_BUNDLE_ID } from '../../lib/utils';
import { getSimulator } from '../../lib/simulator';
import { Simctl } from 'node-simctl';
import B from 'bluebird';
import { retryInterval, waitForCondition } from 'asyncbox';
import xcode from 'appium-xcode';
import { LONG_TIMEOUT, verifyStates } from './helpers';
import { use as chaiUse, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getUIKitCatalogPath, UICATALOG_BUNDLE_ID } from '../setup';

chaiUse(chaiAsPromised);

const OS_VERSION = process.env.MOBILE_OS_VERSION || '26.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 17';

async function deleteSimulator (udid: string, version: string): Promise<void> {
  // only want to get rid of the device if it is present
  const simctl = new Simctl();
  const devices = await simctl.getDevices();
  if (!devices[version]) {
    return;
  }
  const devicePresent = devices[version]
    .filter((device) => device.udid === udid)
    .length > 0;
  if (devicePresent) {
    simctl.udid = udid;
    await simctl.deleteDevice();
  }
}


describe(`simulator ${OS_VERSION}`, function () {
  this.timeout(LONG_TIMEOUT);
  this.retries(2);

  let simctl: Simctl;
  let xcodeVersion: any;
  let customApp: string;

  before(async function () {
    xcodeVersion = await xcode.getVersion(true);
    customApp = await getUIKitCatalogPath();
  });

  beforeEach(async function () {
    await killAllSimulators();
    simctl = new Simctl();
    simctl.udid = await simctl.createDevice('ios-simulator testing',
      DEVICE_NAME,
      OS_VERSION,
      {timeout: 20000});
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
    await expect(sim.isFresh()).to.eventually.be.true;
    await sim.run({startupTimeout: LONG_TIMEOUT / 2});
    await expect(sim.isFresh()).to.eventually.be.false;
    await sim.shutdown();
    await sim.clean();
    await expect(sim.isFresh()).to.eventually.be.true;
  });

  it('should launch and shutdown a sim', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT / 2});
    await sim.shutdown();
    expect((await sim.stat()).state).to.equal('Shutdown');
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

    await expect(sim.isAppInstalled(UICATALOG_BUNDLE_ID)).to.eventually.be.true;

    // this remains somewhat flakey
    await retryInterval(5, 1000, async () => {
      await sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true});
    });

    console.log('Application launched'); // eslint-disable-line no-console

    // Wait for application process
    await waitForCondition(
      async () => (await sim.ps()).some(({name}) => name === UICATALOG_BUNDLE_ID), {
        waitMs: 10000,
        intervalMs: 500,
      });

    await sim.removeApp(UICATALOG_BUNDLE_ID);

    // should not be able to launch anymore
    await expect(sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true})).to.eventually.be.rejected;

    expect(await sim.isAppInstalled(UICATALOG_BUNDLE_ID)).to.be.false;
  });

  it('should delete a sim', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await sim.delete();
    await expect(getSimulator(simctl.udid)).to.eventually.be.rejected;
  });

  it('should start a sim using the "run" method', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});

    expect((await sim.stat()).state).to.equal('Booted');

    await sim.shutdown();
    expect((await sim.stat()).state).to.equal('Shutdown');
  });

  it('should be able to start safari', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});
    await sim.openUrl('https://apple.com');
    await expect(sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID)).to.eventually.be.true;
    await sim.shutdown();
  });

  it('should detect if a sim is running', async function () {
    if (!simctl.udid) {
      throw new Error('simctl.udid is null');
    }
    const sim = await getSimulator(simctl.udid);
    await expect(sim.isRunning()).to.eventually.be.false;

    await sim.run({startupTimeout: LONG_TIMEOUT});
    await expect(sim.isRunning()).to.eventually.be.true;

    await sim.shutdown();
    await expect(sim.isRunning()).to.eventually.be.false;
  });

  it('should properly start simulator in headless mode on Xcode9+', async function () {
    if (xcodeVersion.major < 9) {
      return this.skip();
    }

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
  this.timeout(LONG_TIMEOUT);
  this.retries(2);

  let sim: any;

  before(async function () {
    await killAllSimulators();
    const udid = await new Simctl().createDevice(
      'ios-simulator testing',
      DEVICE_NAME,
      OS_VERSION);
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
    await sim.shutdown();
    await B.delay(4000);
  });
  after(async function () {
    await killAllSimulators();
    await deleteSimulator(sim.udid, OS_VERSION);
  });

  it('should start a sim using the "run" method', async function () {
    await sim.run({startupTimeout: LONG_TIMEOUT});

    expect((await sim.stat()).state).to.equal('Booted');

    await sim.shutdown();
    expect((await sim.stat()).state).to.equal('Shutdown');
  });
});

describe('advanced features', function () {
  let sim: any;
  let xcodeVersion: any;
  let customApp: string;

  this.timeout(LONG_TIMEOUT);

  before(async function () {
    xcodeVersion = await xcode.getVersion(true);
    customApp = await getUIKitCatalogPath();

    await killAllSimulators();
    const udid = await new Simctl().createDevice(
      'ios-simulator testing',
      DEVICE_NAME,
      OS_VERSION);
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
      if (!await sim.isAppInstalled(customApp)) {
        await sim.installApp(customApp);
      }
      if (!await sim.isAppRunning(customApp)) {
        await sim.launchApp(UICATALOG_BUNDLE_ID);
      }

      await expect(sim.getUserInstalledBundleIdsByBundleName('UIKitCatalog')).to.eventually.eql([UICATALOG_BUNDLE_ID]);
    });

    it('should scrub custom app', async function () {
      if (!await sim.isAppInstalled(customApp)) {
        await sim.installApp(customApp);
      }
      if (!await sim.isAppRunning(customApp)) {
        await sim.launchApp(UICATALOG_BUNDLE_ID);
      }
      await sim.scrubApp(UICATALOG_BUNDLE_ID);
      await expect(sim.isAppRunning(UICATALOG_BUNDLE_ID)).to.eventually.be.false;
      await sim.launchApp(UICATALOG_BUNDLE_ID);
      await expect(sim.isAppRunning(UICATALOG_BUNDLE_ID)).to.eventually.be.true;
    });
  });

  describe('biometric (touch Id/face Id enrollment)', function () {
    it(`should properly enroll biometric to enabled state`, async function () {
      if (process.env.DEVICE && parseFloat(process.env.DEVICE) < 11) {
        return this.skip();
      }
      await sim.enrollBiometric(true);
      expect(await sim.isBiometricEnrolled()).to.be.true;
    });

    it(`should properly enroll biometric to disabled state`, async function () {
      if (process.env.DEVICE && parseFloat(process.env.DEVICE) < 11) {
        return this.skip();
      }
      await sim.enrollBiometric(false);
      expect(await sim.isBiometricEnrolled()).to.be.false;
    });
  });

  describe('configureLocalization', function () {
    it(`should properly set locale settings`, async function () {
      if (!_.isFunction(sim.configureLocalization)) {
        return this.skip();
      }

      expect(await sim.configureLocalization({
        language: {
          name: 'en'
        },
        locale: {
          name: 'en_US',
          calendar: 'gregorian',
        },
        keyboard: {
          name: 'en_US',
          layout: 'QWERTY',
        }
      })).to.be.true;
    });
  });

  describe('keychains', function () {
    it('should properly backup and restore Simulator keychains', async function () {
      if (await sim.backupKeychains()) {
        expect(await sim.restoreKeychains('*.db*')).to.be.true;
      }
    });

    it('should clear Simulator keychains while it is running', async function () {
      await expect(sim.clearKeychains()).to.eventually.be.fulfilled;
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
      if (xcodeVersion.major === 13 && process.env.CI) {
        // the test is unstable in CI env
        return this.skip();
      }
      await sim.launchApp(MOBILE_SAFARI_BUNDLE_ID, {wait: true});
      await sim.scrubSafari();
      await expect(sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID)).to.eventually.be.false;
      await sim.launchApp(MOBILE_SAFARI_BUNDLE_ID, {wait: true});
      await expect(sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID)).to.eventually.be.true;
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
      await expect(sim.setPermission('com.apple.Maps', 'location', 'yes')).to.not.be.rejected;
      await expect(sim.setPermission('com.apple.Maps', 'location', 'NO')).to.not.be.rejected;
      await expect(sim.setPermission('com.apple.Maps', 'location', 'unset')).to.not.be.rejected;
      await expect(sim.setPermission('com.apple.Maps', 'location', 'unsupported')).to.be.rejected;
    });

    it('should set and get with wix command', async function () {
      await sim.setPermission('com.apple.Maps', 'contacts', 'yes');
      await expect(sim.getPermission('com.apple.Maps', 'contacts')).to.eventually.eql('yes');
      await sim.setPermission('com.apple.Maps', 'contacts', 'no');
      await expect(sim.getPermission('com.apple.Maps', 'contacts')).to.eventually.eql('no');

      // unset sets as 'no'
      await sim.setPermission('com.apple.Maps', 'contacts', 'yes');
      await expect(sim.getPermission('com.apple.Maps', 'contacts')).to.eventually.eql('yes');
      await sim.setPermission('com.apple.Maps', 'contacts', 'unset');
      await expect(sim.getPermission('com.apple.Maps', 'contacts')).to.eventually.eql('no');
    });
  });
});

describe(`multiple instances of ${OS_VERSION} simulator on Xcode9+`, function () {
  this.timeout(LONG_TIMEOUT * 2);
  this.retries(2);

  let simulatorsMapping: Record<string, any> = {};
  let xcodeVersion: any;
  const DEVICES_COUNT = 2;

  before(async function () {

    xcodeVersion = await xcode.getVersion(true);
    if (xcodeVersion.major < 9) {
      return this.skip();
    }

    await killAllSimulators();

    const simctl = new Simctl();
    for (let i = 0; i < DEVICES_COUNT; i++) {
      const udid = await simctl.createDevice(
        `ios-simulator_${i}_testing`,
        DEVICE_NAME,
        OS_VERSION);
      simulatorsMapping[udid] = await getSimulator(udid);
    }
  });
  after(async function () {
    try {
      await killAllSimulators();
      const simctl = new Simctl();
      for (const udid of _.keys(simulatorsMapping)) {
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
  beforeEach(killAllSimulators);
  afterEach(killAllSimulators);

  it(`should start multiple simulators in 'default' mode`, async function () {
    const simulators = _.values(simulatorsMapping);

    // they all should be off
    await retryInterval(30, 1000, async function () {
      await B.map(simulators, (sim) => verifyStates(sim, false, false));
    });

    // Should be called before launching simulator
    await expect(simulators[0].getUserInstalledBundleIdsByBundleName('UICatalog')).to.eventually.eql([]);

    for (const sim of _.values(simulatorsMapping)) {
      await sim.run({startupTimeout: LONG_TIMEOUT});
    }
    await retryInterval(30, 1000, async function () {
      await B.map(simulators, (sim) => verifyStates(sim, true, true));
    });

    for (const sim of _.values(simulatorsMapping)) {
      await sim.shutdown();
    }
    await retryInterval(30, 1000, async function () {
      await B.map(simulators, (sim) => verifyStates(sim, false, true));
    });
  });
});

describe('getWebInspectorSocket', function () {
  this.timeout(LONG_TIMEOUT);
  let sim: any;

  before(async function () {
    await killAllSimulators();
    const udid = await new Simctl().createDevice(
      'ios-simulator testing',
      DEVICE_NAME,
      OS_VERSION);
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

    if (parseFloat(OS_VERSION) < 11.3) {
      expect(socket).to.be.null;
    } else {
      expect(socket).to.include('/private/tmp/com.apple.launchd');
      expect(socket).to.include('com.apple.webinspectord_sim.socket');
    }
  });
  describe('two simulators', function () {
    let sim2: any;

    before(async function () {
      if (parseFloat(OS_VERSION) < 11.3) {
        // no need to do this below 11.3, since there will not be a socket
        return this.skip();
      }

      const udid = await new Simctl().createDevice(
        'ios-simulator testing',
        DEVICE_NAME,
        OS_VERSION);
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
      expect(socket).to.exist;

      const socket2 = await sim2.getWebInspectorSocket();
      expect(socket2).to.exist;

      expect(socket).to.not.eql(socket2);
    });
    it('should always get the same socket', async function () {
      let socket = await sim.getWebInspectorSocket();
      for (let i = 0; i < 10; i++) {
        sim.webInspectorSocket = null;
        const socket2 = await sim.getWebInspectorSocket();
        expect(socket).to.eql(socket2);
        socket = socket2;
      }
    });
  });
});


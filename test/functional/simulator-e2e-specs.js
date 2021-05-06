// transpile:mocha
import _ from 'lodash';
import { getSimulator, killAllSimulators } from '../..';
import Simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fs } from 'appium-support';
import B from 'bluebird';
import { absolute as testAppPath } from 'ios-test-app';
import { retryInterval, waitForCondition } from 'asyncbox';
import path from 'path';
import xcode from 'appium-xcode';
import { LONG_TIMEOUT, verifyStates } from './helpers';
import { readSettings } from '../../lib/settings';


const BUNDLE_ID = 'io.appium.TestApp';
const OS_VERSION = process.env.MOBILE_OS_VERSION || '14.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 11';

chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

async function deleteSimulator (udid, version) {
  // only want to get rid of the device if it is present
  const simctl = new Simctl();
  let devices = await simctl.getDevices();
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

let xcodeVersion;

describe(`simulator ${OS_VERSION}`, function () {
  this.timeout(LONG_TIMEOUT);
  this.retries(2);

  let simctl;

  let app = testAppPath.iphonesimulator;
  before(async function () {
    let exists = await fs.exists(app);
    if (!exists) {
      app = path.resolve(__dirname, '..', '..', '..', 'test', 'assets', 'TestApp-iphonesimulator.app');
    }

    xcodeVersion = await xcode.getVersion(true);
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
    await deleteSimulator(simctl.udid, OS_VERSION);
  });

  async function installApp (sim, app) {
    await sim.installApp(app);
    if (process.env.TRAVIS) {
      await B.delay(5000);
    }
  }

  it('should detect whether a simulator has been run before', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.isFresh().should.eventually.equal(true);
    await sim.launchAndQuit(false, LONG_TIMEOUT);
    await sim.isFresh().should.eventually.equal(false);
  });

  it('should launch and shutdown a sim', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.launchAndQuit(false, LONG_TIMEOUT);
    (await sim.stat()).state.should.equal('Shutdown');
  });

  it('should launch and shutdown a sim, also starting safari', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.launchAndQuit(true, LONG_TIMEOUT);
    (await sim.stat()).state.should.equal('Shutdown');
  });


  it('should clean a sim', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.isFresh().should.eventually.equal(true);
    await sim.launchAndQuit(false, LONG_TIMEOUT);
    await sim.isFresh().should.eventually.equal(false);
    await sim.clean();
    await sim.isFresh().should.eventually.equal(true);
  });

  it('should not find any TestApp data or bundle directories on a fresh simulator', async function () {
    let sim = await getSimulator(simctl.udid);
    let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
    dirs.should.have.length(0);
  });

  it('should find both a data and bundle directory for TestApp', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});

    // install & launch test app
    await installApp(sim, app);
    await simctl.launchApp(BUNDLE_ID);

    let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
    dirs.should.have.length(2);
    dirs[0].should.contain('/Data/');
    dirs[1].should.contain('/Bundle/');

    await sim.getUserInstalledBundleIdsByBundleName('TestApp').should.eventually.not.empty;
  });

  it('should be able to delete an app', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});

    // install & launch test app
    await installApp(sim, app);

    console.log('Application installed'); // eslint-disable-line no-console

    (await sim.isAppInstalled(BUNDLE_ID)).should.be.true;

    // this remains somewhat flakey
    await retryInterval(5, 1000, async () => {
      await simctl.launchApp(BUNDLE_ID, 1);
    });

    console.log('Application launched'); // eslint-disable-line no-console

    // Wait for application process
    await waitForCondition(
      async () => (await sim.ps()).some(({name}) => name === BUNDLE_ID), {
        waitMs: 10000,
        intervalMs: 500,
      });

    await sim.removeApp(BUNDLE_ID);

    // should not be able to launch anymore
    await simctl.launchApp(BUNDLE_ID, 1).should.eventually.be.rejected;

    (await sim.isAppInstalled(BUNDLE_ID)).should.be.false;
  });

  it('should delete custom app data', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});

    // install & launch test app
    await installApp(sim, app);

    // this remains somewhat flakey
    await retryInterval(5, 1000, async () => {
      await simctl.launchApp(BUNDLE_ID, 1);
    });

    // delete app directories
    await sim.cleanCustomApp('TestApp', BUNDLE_ID);

    // clear paths to force the simulator to get a new list of directories
    sim.appDataBundlePaths = {};

    let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
    dirs.should.have.length(0);
  });

  it('should delete a sim', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.delete();
    await getSimulator(simctl.udid).should.eventually.be.rejected;
  });

  let itText = 'should match a bundleId to its app directory on a used sim';
  let bundleId = 'com.apple.mobilesafari';
  if (OS_VERSION === '7.1') {
    itText = 'should match an app to its app directory on a used sim';
    bundleId = 'MobileSafari';
  }
  it(itText, async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.launchAndQuit(false, LONG_TIMEOUT);

    let path = await sim.getAppDir(bundleId);
    await fs.hasAccess(path).should.eventually.be.true;
  });

  itText = 'should not match a bundleId to its app directory on a fresh sim';
  bundleId = 'com.apple.mobilesafari';
  if (OS_VERSION === '7.1') {
    itText = 'should not match an app to its app directory on a fresh sim';
    bundleId = 'MobileSafari';
  }
  it(itText, async function () {
    let sim = await getSimulator(simctl.udid);
    let path = await sim.getAppDir(bundleId);
    chai.should().equal(path, undefined);
  });

  it('should start a sim using the "run" method', async function () {
    let sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});

    let stat = await sim.stat();
    stat.state.should.equal('Booted');

    await sim.shutdown();
    stat = await sim.stat();
    stat.state.should.equal('Shutdown');
  });

  it('should be able to start safari', async function () {
    let sim = await getSimulator(simctl.udid);

    await sim.run({startupTimeout: LONG_TIMEOUT});
    await sim.openUrl('http://apple.com');
    await sim.shutdown();

    // this test to catch errors in openUrl, that arise from bad sims or certain versions of xcode
  });

  it('should detect if a sim is running', async function () {
    let sim = await getSimulator(simctl.udid);
    let running = await sim.isRunning();
    running.should.be.false;

    await sim.run({startupTimeout: LONG_TIMEOUT});
    running = await sim.isRunning();
    running.should.be.true;

    await sim.shutdown();
    running = await sim.isRunning();
    running.should.be.false;
  });

  it('should isolate sim', async function () {
    let sim = await getSimulator(simctl.udid);
    await sim.isolateSim();
  });

  it('should apply calendar access to simulator', async function () {
    let sim = await getSimulator(simctl.udid);

    if ((xcodeVersion.major === 11 && xcodeVersion.minor >= 4) || xcodeVersion.major >= 12) {
      await sim.run({startupTimeout: LONG_TIMEOUT});
      await sim.enableCalendarAccess(BUNDLE_ID);
      await sim.disableCalendarAccess(BUNDLE_ID);
    } else {
      await sim.enableCalendarAccess(BUNDLE_ID);
      (await sim.hasCalendarAccess(BUNDLE_ID)).should.be.true;
      await sim.disableCalendarAccess(BUNDLE_ID);
      (await sim.hasCalendarAccess(BUNDLE_ID)).should.be.false;
    }
  });

  it('should properly start simulator in headless mode on Xcode9+', async function () {
    if (xcodeVersion.major < 9) {
      return this.skip();
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

  let sim;

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

    let stat = await sim.stat();
    stat.state.should.equal('Booted');

    await sim.shutdown();
    stat = await sim.stat();
    stat.state.should.equal('Shutdown');
  });
});

describe('advanced features', function () {
  let sim;
  this.timeout(LONG_TIMEOUT);

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

  describe('biometric (touch Id/face Id enrollment)', function () {
    it(`should properly enroll biometric to enabled state`, async function () {
      if (process.env.DEVICE && parseFloat(process.env.DEVICE) < 11) {
        return this.skip();
      }
      await sim.enrollBiometric(true);
      (await sim.isBiometricEnrolled()).should.be.true;
    });

    it(`should properly enroll biometric to disabled state`, async function () {
      if (process.env.DEVICE && parseFloat(process.env.DEVICE) < 11) {
        return this.skip();
      }
      await sim.enrollBiometric(false);
      (await sim.isBiometricEnrolled()).should.be.false;
    });
  });

  describe('configureLocalization', function () {
    it(`should properly set locale settings`, async function () {
      if (!_.isFunction(sim.configureLocalization)) {
        return this.skip();
      }

      await sim.configureLocalization({
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
      });
    });
  });

  describe('keychains', function () {
    this.retries(2);

    it('should properly backup and restore Simulator keychains', async function () {
      if (await sim.backupKeychains()) {
        (await sim.restoreKeychains('*.db*')).should.be.true;
      }
    });

    it('should clear Simulator keychains while it is running', async function () {
      await sim.clearKeychains().should.eventually.be.fulfilled;
    });
  });

  describe(`setReduceMotion`, function () {
    it('should check accessibility reduce motion settings', async function () {
      await sim.setReduceMotion(true);
      let fileSettings = await readSettings(sim, 'accessibilitySettings');
      for (const [, settings] of _.toPairs(fileSettings)) {
        settings.ReduceMotionEnabled.should.eql(1);
      }

      await sim.setReduceMotion(false);
      fileSettings = await readSettings(sim, 'accessibilitySettings');
      for (const [, settings] of _.toPairs(fileSettings)) {
        settings.ReduceMotionEnabled.should.eql(0);
      }
    });
  });

  describe('updateSafariGlobalSettings', function () {
    it('should set an arbitrary preference on the global Safari plist', async function () {
      await sim.updateSafariGlobalSettings({
        DidImportBuiltinBookmarks: true,
      });
      let setSettings = await readSettings(sim, 'globalMobileSafari');
      for (const [file, settings] of _.toPairs(setSettings)) {
        file.endsWith('data/Library/Preferences/com.apple.mobilesafari.plist').should.be.true;
        settings.DidImportBuiltinBookmarks.should.eql(true);
      }

      await sim.updateSafariGlobalSettings({
        DidImportBuiltinBookmarks: false,
      });
      setSettings = await readSettings(sim, 'globalMobileSafari');
      for (const [file, settings] of _.toPairs(setSettings)) {
        file.endsWith('data/Library/Preferences/com.apple.mobilesafari.plist').should.be.true;
        settings.DidImportBuiltinBookmarks.should.eql(false);
      }
    });
  });
});

describe(`multiple instances of ${OS_VERSION} simulator on Xcode9+`, function () {
  this.timeout(LONG_TIMEOUT * 2);
  this.retries(2);

  let simulatorsMapping = {};
  const DEVICES_COUNT = 2;

  before(async function () {
    if (_.isEmpty(xcodeVersion)) {
      xcodeVersion = await xcode.getVersion(true);
    }
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
        } catch (err) {
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
    await simulators[0].getUserInstalledBundleIdsByBundleName('UICatalog').should.eventually.eql([]);

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
  let sim;

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
    let socket = await sim.getWebInspectorSocket();

    if (parseFloat(OS_VERSION) < 11.3) {
      expect(socket).to.be.null;
    } else {
      socket.should.include('/private/tmp/com.apple.launchd');
      socket.should.include('com.apple.webinspectord_sim.socket');
    }
  });
  describe('two simulators', function () {
    let sim2;

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
      if (sim2) {
        await deleteSimulator(sim2.udid, OS_VERSION);
      }
    });
    it('should not confuse two different simulators', async function () {
      let socket = await sim.getWebInspectorSocket();
      socket.should.exist;

      let socket2 = await sim2.getWebInspectorSocket();
      socket2.should.exist;

      socket.should.not.eql(socket2);
    });
    it('should always get the same socket', async function () {
      let socket = await sim.getWebInspectorSocket();
      for (let i = 0; i < 10; i++) {
        sim.webInspectorSocket = null;
        let socket2 = await sim.getWebInspectorSocket();
        socket.should.eql(socket2);
        socket = socket2;
      }
    });
  });
});

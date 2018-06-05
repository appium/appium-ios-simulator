// transpile:mocha
import _ from 'lodash';
import { getSimulator, killAllSimulators } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fs } from 'appium-support';
import B from 'bluebird';
import { absolute as testAppPath } from 'ios-test-app';
import { retryInterval } from 'asyncbox';
import path from 'path';
import xcode from 'appium-xcode';
import { LONG_TIMEOUT, verifyStates } from './helpers';


const BUNDLE_ID = 'io.appium.TestApp';

chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

async function deleteSimulator (udid, version) {
  // only want to get rid of the device if it is present
  let devices = await simctl.getDevices();
  if (!devices[version]) {
    return;
  }
  let devicePresent = devices[version]
    .filter((device) => {
      return device.udid === udid;
    }).length > 0;
  if (devicePresent) {
    await simctl.deleteDevice(udid);
  }
}

function runTests (deviceType) {
  describe(`simulator ${deviceType.version}`, function () {
    this.timeout(LONG_TIMEOUT);
    let udid;

    let app = testAppPath.iphonesimulator;
    before(async function () {
      let exists = await fs.exists(app);
      if (!exists) {
        app = path.resolve(__dirname, '..', '..', '..', 'test', 'assets', 'TestApp-iphonesimulator.app');
      }
    });

    beforeEach(async function () {
      await killAllSimulators();
      udid = await simctl.createDevice('ios-simulator testing',
                                       deviceType.device,
                                       deviceType.version,
                                       20000);
      // just need a little more space in the logs
      console.log('\n\n'); // eslint-disable-line no-console
    });
    afterEach(async function () {
      await killAllSimulators();
      await deleteSimulator(udid, deviceType.version);
    });

    async function installApp (sim, app) {
      await sim.installApp(app);
      if (process.env.TRAVIS) {
        await B.delay(5000);
      }
    }

    it('should detect whether a simulator has been run before', async function () {
      let sim = await getSimulator(udid);
      await sim.isFresh().should.eventually.equal(true);
      await sim.launchAndQuit(false, LONG_TIMEOUT);
      await sim.isFresh().should.eventually.equal(false);
    });

    it('should launch and shutdown a sim', async function () {
      let sim = await getSimulator(udid);
      await sim.launchAndQuit(false, LONG_TIMEOUT);
      (await sim.stat()).state.should.equal('Shutdown');
    });

    it('should launch and shutdown a sim, also starting safari', async function () {
      let sim = await getSimulator(udid);
      await sim.launchAndQuit(true, LONG_TIMEOUT);
      (await sim.stat()).state.should.equal('Shutdown');
    });


    it('should clean a sim', async function () {
      let sim = await getSimulator(udid);
      await sim.isFresh().should.eventually.equal(true);
      await sim.launchAndQuit(false, LONG_TIMEOUT);
      await sim.isFresh().should.eventually.equal(false);
      await sim.clean();
      await sim.isFresh().should.eventually.equal(true);
    });

    it('should not find any TestApp data or bundle directories on a fresh simulator', async function () {
      let sim = await getSimulator(udid);
      let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
      dirs.should.have.length(0);
    });

    it('should find both a data and bundle directory for TestApp', async function () {
      let sim = await getSimulator(udid);
      await sim.run({startupTimeout: LONG_TIMEOUT});

      // install & launch test app
      await installApp(sim, app);
      await simctl.launch(udid, BUNDLE_ID);

      let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
      dirs.should.have.length(2);
      dirs[0].should.contain('/Data/');
      dirs[1].should.contain('/Bundle/');
    });

    it('should be able to delete an app', async function () {
      // TODO: figure out why this times out in Travis
      if (process.env.TRAVIS) return this.skip(); // eslint-disable-line curly

      let sim = await getSimulator(udid);
      await sim.run({startupTimeout: LONG_TIMEOUT});

      let error = /The operation couldn’t be completed/;
      if (!process.env.TRAVIS) {
        if ((process.env.DEVICE && parseInt(process.env.DEVICE, 10) >= 10) || (deviceType.version && parseInt(deviceType.version, 10) >= 10)) {
          error = /The request was denied by service delegate/;
        }
      }

      // install & launch test app
      await installApp(sim, app);

      console.log('Application installed'); // eslint-disable-line no-console

      (await sim.isAppInstalled(BUNDLE_ID)).should.be.true;

      // this remains somewhat flakey
      await retryInterval(5, 1000, async () => {
        await simctl.launch(udid, BUNDLE_ID, 1);
      });

      console.log('Application launched'); // eslint-disable-line no-console

      await sim.removeApp(BUNDLE_ID);

      // should not be able to launch anymore
      await simctl.launch(udid, BUNDLE_ID, 1)
        .should.eventually.be.rejectedWith(error);

      (await sim.isAppInstalled(BUNDLE_ID)).should.be.false;

      console.log('Test case finished'); // eslint-disable-line no-console
    });

    it('should delete custom app data', async function () {
      let sim = await getSimulator(udid);
      await sim.run({startupTimeout: LONG_TIMEOUT});

      // install & launch test app
      await installApp(sim, app);

      // this remains somewhat flakey
      await retryInterval(5, 1000, async () => {
        await simctl.launch(udid, BUNDLE_ID, 1);
      });

      // delete app directories
      await sim.cleanCustomApp('TestApp', BUNDLE_ID);

      // clear paths to force the simulator to get a new list of directories
      sim.appDataBundlePaths = {};

      let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
      dirs.should.have.length(0);
    });

    it('should delete a sim', async function () {
      let numDevices = (await simctl.getDevices())[deviceType.version].length;
      numDevices.should.be.above(0);

      let sim = await getSimulator(udid);
      await sim.delete();
      let numDevicesAfter = (await simctl.getDevices())[deviceType.version].length;
      numDevicesAfter.should.equal(numDevices-1);
    });

    let itText = 'should match a bundleId to its app directory on a used sim';
    let bundleId = 'com.apple.mobilesafari';
    if (deviceType.version === '7.1') {
      itText = 'should match an app to its app directory on a used sim';
      bundleId = 'MobileSafari';
    }
    it(itText, async function () {
      let sim = await getSimulator(udid);
      await sim.launchAndQuit(false, LONG_TIMEOUT);

      let path = await sim.getAppDir(bundleId);
      await fs.hasAccess(path).should.eventually.be.true;
    });

    itText = 'should not match a bundleId to its app directory on a fresh sim';
    bundleId = 'com.apple.mobilesafari';
    if (deviceType.version === '7.1') {
      itText = 'should not match an app to its app directory on a fresh sim';
      bundleId = 'MobileSafari';
    }
    it(itText, async function () {
      let sim = await getSimulator(udid);
      let path = await sim.getAppDir(bundleId);
      chai.should().equal(path, undefined);
    });

    it('should start a sim using the "run" method', async function () {
      let sim = await getSimulator(udid);

      await sim.run({startupTimeout: LONG_TIMEOUT});

      let stat = await sim.stat();
      stat.state.should.equal('Booted');

      await sim.shutdown();
      stat = await sim.stat();
      stat.state.should.equal('Shutdown');
    });

    it('should be able to start safari', async function () {
      let sim = await getSimulator(udid);

      await sim.run({startupTimeout: LONG_TIMEOUT});
      await sim.openUrl('http://apple.com');
      await sim.shutdown();

      // this test to catch errors in openUrl, that arise from bad sims or certain versions of xcode
    });

    it('should detect if a sim is running', async function () {
      let sim = await getSimulator(udid);
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
      let sim = await getSimulator(udid);
      await sim.isolateSim();

      let numDevices = (await simctl.getDevices())[deviceType.version].length;

      numDevices.should.equal(1);
    });

    it('should apply calendar access to simulator', async function () {
      let arbitraryUDID = (await simctl.getDevices())[deviceType.version][0].udid;
      let sim = await getSimulator(arbitraryUDID);
      await sim.enableCalendarAccess(BUNDLE_ID);
      (await sim.hasCalendarAccess(BUNDLE_ID)).should.be.true;
      await sim.disableCalendarAccess(BUNDLE_ID);
      (await sim.hasCalendarAccess(BUNDLE_ID)).should.be.false;
    });

    it('should properly start simulator in headless mode on Xcode9+', async function () {
      const xcodeVersion = await xcode.getVersion(true);
      if (xcodeVersion.major < 9) {
        return this.skip();
      }

      const sim = await getSimulator(udid);
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

  describe(`reuse an already-created already-run simulator ${deviceType.version}`, function () {
    this.timeout(LONG_TIMEOUT);
    let sim;
    before(async function () {
      await killAllSimulators();
      let udid = await simctl.createDevice('ios-simulator testing',
                                       deviceType.device,
                                       deviceType.version);
      sim = await getSimulator(udid);
      await sim.run({startupTimeout: LONG_TIMEOUT});
      await sim.shutdown();
      await B.delay(4000);
    });
    after(async function () {
      await killAllSimulators();
      await deleteSimulator(sim.udid, deviceType.version);
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

  describe('biometric (touch Id, face Id) enrollment', async function () {
    let sim;
    this.timeout(LONG_TIMEOUT);

    before(async function () {
      await killAllSimulators();
      let udid = await simctl.createDevice('ios-simulator testing',
                                           deviceType.device,
                                           deviceType.version);
      sim = await getSimulator(udid);
      await sim.run({
        startupTimeout: LONG_TIMEOUT,
      });
    });
    after(async function () {
      await killAllSimulators();
      await deleteSimulator(sim.udid, deviceType.version);
    });
    const biometrics = ['touchId', 'faceId'];

    for (let biometric of biometrics) {
      // FIXME: Remove this test after Appium's parent process has accessibility permissions
      // on Travis
      it(`should fail if cannot enroll ${biometric}`, async function () {
        if (!process.env.TRAVIS) {
          this.skip();
        }
        const errorPattern = /is present in System Preferences/;
        await sim.enrollBiometric(true, biometric).should.eventually.be.rejectedWith(errorPattern);
        await sim.isBiometricEnrolled(biometric).should.eventually.be.rejectedWith(errorPattern);
      });

      it(`should properly enroll ${biometric} to enabled state`, async function () {
        // FIXME: Remove this condition after Appium's parent process has accessibility permissions
        // on Travis
        if (process.env.TRAVIS) {
          this.skip();
        }
        try {
          await sim.enrollBiometric(true, biometric);
          (await sim.isBiometricEnrolled(biometric)).should.be.true;
        } catch (e) {
          e.message.should.match(/not supported/);
        }
      });

      it(`should properly enroll ${biometric} to disabled state`, async function () {
        // FIXME: Remove this condition after Appium's parent process has accessibility permissions
        // on Travis
        if (process.env.TRAVIS) {
          this.skip();
        }
        try {
          await sim.enrollBiometric(false, biometric);
          (await sim.isBiometricEnrolled(biometric)).should.be.false;
        } catch (e) {
          e.message.should.match(/not supported/);
        }
      });
    }
  });


  describe('keychains backup', async function () {
    let sim;
    this.timeout(LONG_TIMEOUT);

    before(async function () {
      await killAllSimulators();
      let udid = await simctl.createDevice('ios-simulator testing',
                                           deviceType.device,
                                           deviceType.version);
      sim = await getSimulator(udid);
      await sim.run({
        startupTimeout: LONG_TIMEOUT,
      });
    });
    after(async function () {
      await killAllSimulators();
      await deleteSimulator(sim.udid, deviceType.version);
    });

    it('should properly backup and restore Simulator keychains', async function () {
      (await sim.backupKeychains()).should.be.true;
      (await sim.restoreKeychains('*.db*')).should.be.true;
    });
  });

  describe(`multiple instances of ${deviceType.version} simulator on Xcode9+`, function () {
    this.timeout(LONG_TIMEOUT);
    const simulatorsMapping = new Map();
    const DEVICES_COUNT = 2;

    beforeEach(async function () {
      const xcodeVersion = await xcode.getVersion(true);
      if (xcodeVersion.major < 9) {
        return this.skip();
      }

      await killAllSimulators();
      const udids = await B.map(_.range(1, DEVICES_COUNT + 1),
                                (deviceIdx) => simctl.createDevice(`ios-simulator_${deviceIdx}_testing`,
                                                                   deviceType.device,
                                                                   deviceType.version));
      const simulators = await B.map(udids, (udid) => getSimulator(udid));
      _.zip(udids, simulators).map(([udid, sim]) => simulatorsMapping.set(udid, sim));
    });
    afterEach(async function () {
      try {
        await killAllSimulators();
        const existingUdids = ((await simctl.getDevices())[deviceType.version] || []).map((dev) => dev.udid);
        await B.map(existingUdids.filter((udid) => simulatorsMapping.has(udid)), (udid) => simctl.deleteDevice(udid));
      } finally {
        simulatorsMapping.clear();
      }
    });

    it('should start multiple simulators in "default" mode', async function () {
      const simulators = Array.from(simulatorsMapping.values());
      await B.map(simulators, (sim) => verifyStates(sim, false, false));

      await B.map(simulators, (sim) => sim.run({startupTimeout: LONG_TIMEOUT}));
      await B.map(simulators, (sim) => verifyStates(sim, true, true));

      await B.map(simulators, (sim) => sim.shutdown());
      await B.map(simulators, (sim) => verifyStates(sim, false, true));
    });
  });

  describe('getWebInspectorSocket', function () {
    this.timeout(LONG_TIMEOUT);
    let sim;

    before(async function () {
      await killAllSimulators();
      let udid = await simctl.createDevice('ios-simulator testing',
                                       deviceType.device,
                                       deviceType.version);
      sim = await getSimulator(udid);
      await sim.run({
        startupTimeout: LONG_TIMEOUT,
      });
    });
    after(async function () {
      await killAllSimulators();
      await deleteSimulator(sim.udid, deviceType.version);
    });
    it('should get a socket when appropriate', async function () {
      let socket = await sim.getWebInspectorSocket();

      if (parseFloat(deviceType.version) < 11.3) {
        expect(socket).to.be.null;
      } else {
        socket.should.include('/private/tmp/com.apple.launchd');
        socket.should.include('com.apple.webinspectord_sim.socket');
      }
    });
    describe('two simulators', function () {
      let sim2;

      before(async function () {
        if (parseFloat(deviceType.version) < 11.3) {
          // no need to do this below 11.3, since there will not be a socket
          return this.skip();
        }

        let udid = await simctl.createDevice('ios-simulator testing',
                                         deviceType.device,
                                         deviceType.version);
        sim2 = await getSimulator(udid);
        await sim2.run({
          startupTimeout: LONG_TIMEOUT,
        });
      });
      after(async function () {
        await killAllSimulators();
        if (sim2) {
          await deleteSimulator(sim2.udid, deviceType.version);
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
}


let deviceTypes;
if (!process.env.TRAVIS && !process.env.DEVICE) {
  console.log('Not on TRAVIS, testing all versions'); // eslint-disable-line no-console
  deviceTypes = [
    /*{
      version: '9.2',
      device: 'iPhone 6s'
    },
    {
      version: '9.3',
      device: 'iPhone 6s'
    },
    {
      version: '10.0',
      device: 'iPhone 6s'
    },
    {
      version: '10.1',
      device: 'iPhone 6s'
    },
    {
      version: '10.3',
      device: 'iPhone 6s'
    },
    {
      version: '11.0',
      device: 'iPhone 6s'
    },
    {
      version: '11.3',
      device: 'iPhone 6s'
    },*/
    {
      version: '11.4',
      device: 'iPhone X'
    }
  ];
} else {
  // on travis, we want to just do what we specify
  // travis also cannot at the moment create 9.0 and 9.1 sims
  // so only do these if testing somewhere else
  let version = (process.env.DEVICE === '10' || process.env.DEVICE === '10.0') ? '10.0' : process.env.DEVICE;
  deviceTypes = [
    {
      version,
      device: 'iPhone 6s'
    }
  ];
}

for (let deviceType of deviceTypes) {
  runTests(deviceType);
}

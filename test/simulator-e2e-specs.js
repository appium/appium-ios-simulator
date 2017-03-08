// transpile:mocha

import { getSimulator, killAllSimulators } from '..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { fs } from 'appium-support';
import B from 'bluebird';
import getAppPath from 'sample-apps';
import { retryInterval } from 'asyncbox';

const LONG_TIMEOUT = 240*1000;
const BUNDLE_ID = 'io.appium.TestApp';

chai.should();
chai.use(chaiAsPromised);

function runTests (deviceType) {
  describe(`simulator ${deviceType.version}`, function () {
    this.timeout(LONG_TIMEOUT);
    let udid;
    before(async function () {
      await killAllSimulators();
    });

    beforeEach(async function () {
      udid = await simctl.createDevice('ios-simulator testing',
                                       deviceType.device,
                                       deviceType.version,
                                       20000);
      // just need a little more space in the logs
      console.log('\n\n');  // eslint-disable-line no-console
    });
    afterEach(async function () {
      // only want to get rid of the device if it is present
      let devicePresent = (await simctl.getDevices())[deviceType.version]
        .filter((device) => {
          return device.udid === udid;
        }).length > 0;
      if (devicePresent) {
        await killAllSimulators();
        await simctl.deleteDevice(udid);
      }
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
      await sim.launchAndQuit();
      await sim.isFresh().should.eventually.equal(false);
    });

    it('should launch and shutdown a sim', async function () {
      let sim = await getSimulator(udid);
      await sim.launchAndQuit();
      (await sim.stat()).state.should.equal('Shutdown');
    });

    it('should launch and shutdown a sim, also starting safari', async function () {
      let sim = await getSimulator(udid);
      await sim.launchAndQuit(true);
      (await sim.stat()).state.should.equal('Shutdown');
    });


    it('should clean a sim', async function () {
      let sim = await getSimulator(udid);
      await sim.isFresh().should.eventually.equal(true);
      await sim.launchAndQuit();
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
      await sim.run();

      // install & launch test app
      await installApp(sim, getAppPath('TestApp'));
      await simctl.launch(udid, BUNDLE_ID);

      let dirs = await sim.getAppDirs('TestApp', BUNDLE_ID);
      dirs.should.have.length(2);
      dirs[0].should.contain('/Data/');
      dirs[1].should.contain('/Bundle/');
    });

    it('should be able to delete an app', async function () {
      let sim = await getSimulator(udid);
      await sim.run();

      let error = /The operation couldn’t be completed/;
      if ((process.env.DEVICE && parseInt(process.env.DEVICE, 10) >= 10) || (deviceType.version && parseInt(deviceType.version, 10) >= 10)) {
        error = /The request was denied by service delegate/;
      }

      // install & launch test app
      await installApp(sim, getAppPath('TestApp'));

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
    });

    it('should delete custom app data', async function () {
      let sim = await getSimulator(udid);
      await sim.run();

      // install & launch test app
      await installApp(sim, getAppPath('TestApp'));

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
      await sim.launchAndQuit();

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

      await sim.run();

      let stat = await sim.stat();
      stat.state.should.equal('Booted');

      await sim.shutdown();
      stat = await sim.stat();
      stat.state.should.equal('Shutdown');
    });

    it('should be able to start safari', async function () {
      let sim = await getSimulator(udid);

      await sim.run();
      await sim.openUrl('http://apple.com');
      await sim.shutdown();

      // this test to catch errors in openUrl, that arise from bad sims or certain versions of xcode
    });

    it('should detect if a sim is running', async function () {
      let sim = await getSimulator(udid);
      let running = await sim.isRunning();
      running.should.be.false;

      await sim.run();
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
      await sim.run();
      await sim.shutdown();
      await B.delay(4000);
    });
    after(async function () {
      // only want to get rid of the device if it is present
      let devicePresent = (await simctl.getDevices())[deviceType.version]
        .filter((device) => {
          return device.udid === sim.udid;
        }).length > 0;
      if (devicePresent) {
        await simctl.deleteDevice(sim.udid);
      }
    });

    it('should start a sim using the "run" method', async function () {
      await sim.run();

      let stat = await sim.stat();
      stat.state.should.equal('Booted');

      await sim.shutdown();
      stat = await sim.stat();
      stat.state.should.equal('Shutdown');
    });
  });
}


let deviceTypes;
if (!process.env.TRAVIS && !process.env.DEVICE) {
  console.log('Not on TRAVIS, testing all versions'); // eslint-disable-line no-console
  deviceTypes = [
    {
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
      version: '10.2',
      device: 'iPhone 6s'
    },
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

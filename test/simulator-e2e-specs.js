// transpile:mocha

import { getSimulator } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import { fs } from 'appium-support';


const LONG_TIMEOUT = 35*1000;
const MED_TIMEOUT = 30*1000;

chai.should();
chai.use(chaiAsPromised);

function runTests (deviceType) {
  describe(`simulator ${deviceType.version}`, () => {
    let udid;
    beforeEach(async () => {
      udid = await simctl.createDevice('ios-simulator testing',
                                       deviceType.device,
                                       deviceType.version);
    });
    afterEach(async () => {
      // only want to get rid of the device if it is present
      let devicePresent = (await simctl.getDevices())[deviceType.version]
        .filter((device) => {
          return device.udid === udid;
        }).length > 0;
      if (devicePresent) {
        await simctl.deleteDevice(udid);
      }
    });


    it('should detect whether a simulator has been run before', async function () {
      this.timeout(LONG_TIMEOUT);

      let sim = await getSimulator(udid);
      await sim.isFresh().should.eventually.equal(true);
      await sim.launchAndQuit();
      await sim.isFresh().should.eventually.equal(false);
    });

    it('should launch and shutdown a sim', async function () {
      this.timeout(LONG_TIMEOUT);

      let sim = await getSimulator(udid);
      await sim.launchAndQuit();
      (await sim.stat()).state.should.equal('Shutdown');
    });

    it('should clean a sim', async function () {
      this.timeout(MED_TIMEOUT);

      let sim = await getSimulator(udid);
      await sim.isFresh().should.eventually.equal(true);
      await sim.launchAndQuit();
      await sim.isFresh().should.eventually.equal(false);
      await sim.clean();
      await sim.isFresh().should.eventually.equal(true);
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
      this.timeout(MED_TIMEOUT);

      let sim = await getSimulator(udid);
      await sim.launchAndQuit();

      let path = await sim.getAppDataDir(bundleId);
      await fs.hasAccess(path).should.eventually.be.true;
    });

    itText = 'should match a bundleId to its app directory on a fresh sim';
    bundleId = 'com.apple.mobilesafari';
    if (deviceType.version === '7.1') {
      itText = 'should match an app to its app directory on a fresh sim';
      bundleId = 'MobileSafari';
    }
    it(itText, async function () {
      this.timeout(LONG_TIMEOUT);

      let sim = await getSimulator(udid);
      let path = await sim.getAppDataDir(bundleId);
      await fs.hasAccess(path).should.eventually.be.true;
    });

    it('should start a sim using the "run" method', async function () {
      this.timeout(LONG_TIMEOUT);

      let sim = await getSimulator(udid);

      await sim.run();
      let stat = await sim.stat();
      stat.state.should.equal('Booted');

      await sim.shutdown();
      stat = await sim.stat();
      stat.state.should.equal('Shutdown');
    });
  });
}

const deviceTypes = [
  {
    version: '8.4',
    device: 'iPhone 6'
  },
  {
    version: '9.0',
    device: 'iPhone 6s'
  }
];
for (let deviceType of deviceTypes) {
  runTests(deviceType);
}

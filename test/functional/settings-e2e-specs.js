import * as simctl from 'node-simctl';
import { getSimulator, killAllSimulators } from '../..';
import { readSettings } from '../../lib/settings';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT } from './helpers';
import _ from 'lodash';

chai.should();
chai.use(chaiAsPromised);


describe(`check simulator accesibility settings`, function () {
  this.timeout(LONG_TIMEOUT);
  let udid, version;
  if (!process.env.TRAVIS && !process.env.DEVICE) {
    version = "11.3";
  } else {
    version = (process.env.DEVICE === '10' || process.env.DEVICE === '10.0') ? '10.0' : process.env.DEVICE;
  }
  let deviceType = {
    version,
    device: "iPhone 6s"
  };

  beforeEach(async function () {
    udid = await simctl.createDevice('ios-simulator testing',
                                      deviceType.device,
                                      deviceType.version,
                                      20000);
    // just need a little more space in the logs
    console.log('\n\n'); // eslint-disable-line no-console
  });

  after(async function () {
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

  it("check accesibility reduce motion settings", async function () {
    let sim = await getSimulator(udid);
    await sim.setReduceMotion(true);
    let fileSettings = await readSettings(sim, 'accessibilitySettings');
    for (let [, settings] of _.toPairs(fileSettings)) {
      settings.ReduceMotionEnabled.should.eql(1);
    }
    await sim.setReduceMotion(false);
    fileSettings = await readSettings(sim, 'accessibilitySettings');
    for (let [, settings] of _.toPairs(fileSettings)) {
      settings.ReduceMotionEnabled.should.eql(0);
    }
  });
});

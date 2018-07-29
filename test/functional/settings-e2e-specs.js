import * as simctl from 'node-simctl';
import { getSimulator, killAllSimulators } from '../..';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT } from './helpers';

chai.should();
chai.use(chaiAsPromised);


describe(`check simulator accesibility settings`, function () {
  this.timeout(LONG_TIMEOUT);
  let udid;
  let deviceType = {
    version: "11.3",
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
    await sim.reduceMotion(true);
    let fileSettings = await sim.readSettings('accesibilitySettings');
    for (let file in fileSettings) {
      let settings = fileSettings[file];
      settings.ReduceMotionEnabled.should.eql(1);
    }
    await sim.reduceMotion(false);
    fileSettings = await sim.readSettings('accesibilitySettings');
    for (let file in fileSettings) {
      let settings = fileSettings[file];
      settings.ReduceMotionEnabled.should.eql(0);
    }
  });
});

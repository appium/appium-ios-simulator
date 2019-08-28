import * as simctl from 'node-simctl';
import { getSimulator, killAllSimulators } from '../..';
import { readSettings } from '../../lib/settings';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT } from './helpers';
import _ from 'lodash';


chai.should();
chai.use(chaiAsPromised);

describe('settings', function () {
  this.timeout(LONG_TIMEOUT);
  let udid, version;
  if (!process.env.TRAVIS && !process.env.DEVICE) {
    version = '11.3';
  } else {
    version = (process.env.DEVICE === '10' || process.env.DEVICE === '10.0') ? '10.0' : process.env.DEVICE;
  }
  let deviceType = {
    version,
    device: process.env.DEVICE_NAME || 'iPhone 6s'
  };

  before(async function () {
    udid = await simctl.createDevice('ios-simulator testing',
                                      deviceType.device,
                                      deviceType.version,
                                      {timeout: 20000});
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

  describe(`check simulator accessibility settings`, function () {
    it('check accessibility reduce motion settings', async function () {
      const sim = await getSimulator(udid);
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
      const sim = await getSimulator(udid);
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

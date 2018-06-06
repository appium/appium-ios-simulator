// transpile:mocha

import { getSimulator, getDeviceString } from '../..';
import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import SimulatorXcode7 from '../../lib/simulator-xcode-7';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { devices } from '../assets/deviceList';
import B from 'bluebird';
import xcode from 'appium-xcode';

chai.should();
chai.use(chaiAsPromised);

const UDID = devices['7.1'][0].udid;

describe('simulator', function () {
  let xcodeMock;
  let getDevicesStub;

  beforeEach(function () {
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(simctl, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(function () {
    xcodeMock.restore();
    simctl.getDevices.restore();
  });

  describe('getSimulator', function () {
    it('should create a simulator with default xcode version', async function () {
      let xcodeVersion = {major: 6, versionString: '6.0.0'};
      xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));

      let sim = await getSimulator(UDID);
      sim.xcodeVersion.should.equal(xcodeVersion);
      sim.should.be.an.instanceof(SimulatorXcode6);
    });

    it('should create an xcode 7 simulator with xcode version 7', async function () {
      let xcodeVersion = {major: 7, versionString: '7.0.0'};
      xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));

      let sim = await getSimulator(UDID);
      sim.xcodeVersion.should.equal(xcodeVersion);
      sim.should.be.an.instanceof(SimulatorXcode7);
    });

    it('should throw an error if xcode version less than 6', async function () {
      let xcodeVersion = {major: 5, versionString: '5.4.0'};
      xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));

      await getSimulator(UDID).should.eventually.be.rejectedWith('version');
    });

    it('should throw an error if udid does not exist', async function () {
      await getSimulator('123').should.be.rejectedWith('No sim found');
    });

    it('should list stats for sim', async function () {
      let xcodeVersion = {major: 6, versionString: '6.0.0'};
      xcodeMock.expects('getVersion').atLeast(1).returns(B.resolve(xcodeVersion));

      let sims = [
        getSimulator('F33783B2-9EE9-4A99-866E-E126ADBAD410'),
        getSimulator('DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'),
      ];

      let stats = sims.map((simProm) => {
        return simProm.then((sim) => { // eslint-disable-line promise/prefer-await-to-then
          return sim.stat();
        });
      });

      stats = await B.all(stats);

      stats[0].state.should.equal('Shutdown');
      stats[0].name.should.equal('Resizable iPhone');
      stats[1].state.should.equal('Shutdown');
      stats[1].name.should.equal('Resizable iPad');
    });
  });


  describe('getDeviceString', function () {
    describe('Xcode 6', function () {
      let xcodeVersion = {major: 6, versionString: '6.0.0'};

      beforeEach(function () {
        xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));
      });

      it('should get the correct device for iOS 8+', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(8.4));
        let device = await getDeviceString();
        device.should.equal('iPhone 6 (8.4 Simulator)');
      });
      it('should get the correct device for iOS 8+ when platform version passed in', async function () {
        let device = await getDeviceString({platformVersion: '8.1'});
        device.should.equal('iPhone 6 (8.1 Simulator)');
      });
      it('should get the correct device for iOS 7+', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(7.1));
        let device = await getDeviceString();
        device.should.equal('iPhone 5s (7.1 Simulator)');
      });
      it('should get the correct device for iOS 7+ when platform version passed in', async function () {
        let device = await getDeviceString({platformVersion: '7.1'});
        device.should.equal('iPhone 5s (7.1 Simulator)');
      });
      it('should pass through device name when passed with =', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(8.4));
        let device = await getDeviceString({deviceName: '=fancy device'});
        device.should.equal('fancy device');
      });
      it('should add a device name when passed without =', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(8.4));
        let device = await getDeviceString({deviceName: 'fancy device'});
        device.should.equal('fancy device (8.4 Simulator)');
      });
      it('should handle string platform version', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve('8.4'));
        let device = await getDeviceString();
        device.should.equal('iPhone 6 (8.4 Simulator)');
      });
      it('should strip " Simulator" when not necessary', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve('8.4'));
        let device = await getDeviceString({deviceName: "iPhone 6 Simulator"});
        device.should.equal('iPhone 6 (8.4 Simulator)');
      });
      it('should handle bare "iPhone"', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve('8.4'));
        let device = await getDeviceString({deviceName: "iPhone"});
        device.should.equal('iPhone 6 (8.4 Simulator)');
      });
    });

    describe('Xcode 7', function () {
      let xcodeVersion = {major: 7, versionString: '7.0.0'};

      beforeEach(function () {
        xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));
      });

      it('should get the correct device for iOS 8+', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(8.4));
        let device = await getDeviceString();
        device.should.equal('iPhone 6 (8.4)');
      });
      it('should get the correct device for iOS 8+ when platform version passed in', async function () {
        let device = await SimulatorXcode7.getDeviceString({platformVersion: '8.1'});
        device.should.equal('iPhone 6 (8.1)');
      });
      it('should get the correct device for iOS 9+', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(9));
        let device = await getDeviceString();
        device.should.equal('iPhone 6 (9.0) [');
      });
      it('should get the correct device for iOS 9+ when platform version passed in', async function () {
        let device = await getDeviceString({platformVersion: '9.0'});
        device.should.equal('iPhone 6 (9.0) [');
      });
      it('should pass through device name when passed with =', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(9.0));
        let device = await getDeviceString({deviceName: '=fancy device'});
        device.should.equal('fancy device');
      });
      it('should add a device name when passed without =', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve(9.0));
        let device = await getDeviceString({deviceName: 'fancy device'});
        device.should.equal('fancy device (9.0)');
      });
      it('should strip " Simulator" when not necessary', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve('9.0'));
        let device = await getDeviceString({deviceName: "iPhone 6 Simulator"});
        device.should.equal('iPhone 6 (9.0) [');
      });
      it('should handle bare "iPhone"', async function () {
        xcodeMock.expects('getMaxIOSSDK').returns(B.resolve('9.0'));
        let device = await getDeviceString({deviceName: "iPhone"});
        device.should.equal('iPhone 6 (9.0) [');
      });
    });
  });
});

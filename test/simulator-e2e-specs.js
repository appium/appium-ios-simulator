// transpile:mocha

import { getSimulator } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import { util } from 'appium-support';

let testSimVersion = '8.3';
let testSimDevice = 'iPhone 6';

/*let should =*/ chai.should();
chai.use(chaiAsPromised);

describe('simulator', () => {

  it('should detect whether a simulator has been run before', async function () {
    this.timeout(30*1000);

    let udid = await simctl.createDevice('ios-simulator testing',
                                         testSimDevice,
                                         testSimVersion);
    after(function(done) {
      simctl.deleteDevice(udid).then(done);
    });

    let sim = await getSimulator(udid);

    await sim.isFresh().should.eventually.equal(true);

    await sim.launchAndQuit();

    await sim.isFresh().should.eventually.equal(false);
  });

  it('should launch and shutdown a sim', async function () {
    this.timeout(30*1000);

    let udid = await simctl.createDevice('ios-simulator testing',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.deleteDevice(udid);
    });

    let sim = await getSimulator(udid);

    await sim.launchAndQuit();

    (await sim.stat()).state.should.equal('Shutdown');
  });

  it('should clean a sim', async function () {
    this.timeout(30*1000);

    let udid = await simctl.createDevice('ios-simulator testing',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.deleteDevice(udid);
    });

    let sim = await getSimulator(udid);

    await sim.isFresh().should.eventually.equal(true);

    await sim.launchAndQuit();

    await sim.isFresh().should.eventually.equal(false);

    await sim.clean();

    await sim.isFresh().should.eventually.equal(true);
  });

  it('should delete a sim', async function () {
    let udid = await simctl.createDevice('ios-simulator deleteMe',
                                         testSimDevice,
                                         testSimVersion);

    let numDevices = (await simctl.getDevices())[testSimVersion].length;
    numDevices.should.be.above(0);

    let sim = await getSimulator(udid);

    await sim.delete();

    let numDevicesAfter = (await simctl.getDevices())[testSimVersion].length;

    numDevicesAfter.should.equal(numDevices-1);
  });

  it('should match a bundleId to its app directory on a used sim', async function () {
    this.timeout(30*1000);
    let udid = await simctl.createDevice('ios-simulator deleteMe',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.deleteDevice(udid);
    });

    let sim = await getSimulator(udid);
    await sim.launchAndQuit();

    let path = await sim.getAppDataDir('com.apple.mobilesafari');
    await util.fileExists(path).should.eventually.be.true;
  });

  it.only('should match a bundleId to its app directory on a fresh sim', async function () {
    this.timeout(30*1000);
    let udid = await simctl.createDevice('ios-simulator deleteMe',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.deleteDevice(udid);
    });

    let sim = await getSimulator(udid);

    let path = await sim.getAppDataDir('com.apple.mobilesafari');
    await util.fileExists(path).should.eventually.be.true;
  });
});

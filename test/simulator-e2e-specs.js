// transpile:mocha

import { getSimulator } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';

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
      simctl.eraseDevice(udid).then(done);
    });

    let sim = await getSimulator(udid);

    await sim.isFresh().should.eventually.equal(true);

    await sim.launchAndQuit();

    await sim.isFresh().should.eventually.equal(false);
  });

  it.skip('should launch and shutdown a sim', async function () {
    this.timeout(25*1000);

    let udid = await simctl.createDevice('ios-simulator testing',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.eraseDevice(udid);
    });

    let sim = await getSimulator(udid);

    await sim.launchAndQuit();

    // TODO get sim stat to make sure it was shut down
  });

  it.skip('should clean a sim', async function () {
    this.timeout(30*1000);

    let udid = await simctl.createDevice('ios-simulator testing',
                                         testSimDevice,
                                         testSimVersion);

    after(async () => {
      await simctl.eraseDevice(udid);
    });

    let sim = await getSimulator(udid);

    await sim.isFresh().should.eventually.equal(true);

    await sim.launchAndQuit();

    await sim.isFresh().should.eventually.equal(false);

    await sim.clean();

    await sim.isFresh().should.eventually.equal(true);
  });

  //TODO e2e tests. check that rootdir exists
  //shutdown
});

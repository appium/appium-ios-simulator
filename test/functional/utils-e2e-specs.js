// transpile:mocha
import { getSimulator, killAllSimulators } from '../..';
import * as simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT, verifyStates } from './helpers';


chai.should();
chai.use(chaiAsPromised);

const deviceVersion = process.env.DEVICE ? process.env.DEVICE : '10.3';

describe('killAllSimulators', function () {
  this.timeout(LONG_TIMEOUT);

  let sim;
  beforeEach(async function () {
    await killAllSimulators();
    let udid = await simctl.createDevice('ios-simulator testing',
                                         'iPhone 6s',
                                         deviceVersion,
                                         20000);
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
  });
  afterEach(async function () {
    await killAllSimulators();
    try {
      await simctl.deleteDevice(sim.udid);
    } catch (ign) {}
  });
  it('should be able to kill the simulators', async function () {
    await verifyStates(sim, true, true);
    await killAllSimulators();
    await verifyStates(sim, false, false);
  });
});

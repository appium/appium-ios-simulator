// transpile:mocha
import { getSimulator, killAllSimulators } from '../..';
import Simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { LONG_TIMEOUT, verifyStates } from './helpers';


chai.should();
chai.use(chaiAsPromised);

const OS_VERSION = process.env.MOBILE_OS_VERSION || '14.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 11';

describe('killAllSimulators', function () {
  this.timeout(LONG_TIMEOUT);

  let sim;
  beforeEach(async function () {
    await killAllSimulators();
    let udid = await new Simctl().createDevice(
      'ios-simulator testing',
      DEVICE_NAME,
      OS_VERSION,
      {timeout: 20000});
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
  });
  afterEach(async function () {
    await killAllSimulators();
    try {
      await sim.simctl.deleteDevice();
    } catch (ign) {}
  });
  it('should be able to kill the simulators', async function () {
    await verifyStates(sim, true, true);
    await killAllSimulators();
    await verifyStates(sim, false, false);
  });
});

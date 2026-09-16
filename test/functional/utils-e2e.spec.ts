import {describe, it, beforeEach, afterEach} from 'node:test';

import {getSimulator} from '../../lib/simulator.js';
import type {Simulator} from '../../lib/types.js';
import {killAllSimulators} from '../../lib/utils/index.js';
import {LONG_TIMEOUT, verifyStates} from './helpers.js';
import {createTestDevice, deleteTestDevice} from './native-test-helpers.js';

const OS_VERSION = process.env.MOBILE_OS_VERSION || '14.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 11';

describe('killAllSimulators', function () {
  let sim: Simulator;

  beforeEach(async function () {
    await killAllSimulators();
    const udid = await createTestDevice('ios-simulator testing', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
    await sim.run({startupTimeout: LONG_TIMEOUT});
  });
  afterEach(async function () {
    await killAllSimulators();
    await deleteTestDevice(sim.udid);
  });
  it('should be able to kill the simulators', async function () {
    await verifyStates(sim, true, true);
    await killAllSimulators();
    await verifyStates(sim, false, false);
  });
});

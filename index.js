// transpile:main

import * as sim from './lib/simulator';
import * as utils from './lib/utils';

const { getSimulator } = sim;
const {
  killAllSimulators, endAllSimulatorDaemons, simExists
} = utils;

export {
  getSimulator,
  killAllSimulators,
  endAllSimulatorDaemons,
  simExists,
};

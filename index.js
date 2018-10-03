// transpile:main

import * as sim from './lib/simulator';
import * as utils from './lib/utils';
import * as sim6 from './lib/simulator-xcode-6';


const { getSimulator, getDeviceString } = sim;
const { killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert, hasSSLCert } = utils;
const { BOOT_COMPLETED_EVENT } = sim6;

export {
  getSimulator,
  getDeviceString,
  killAllSimulators,
  endAllSimulatorDaemons,
  simExists,
  installSSLCert,
  uninstallSSLCert,
  hasSSLCert,
  BOOT_COMPLETED_EVENT
};

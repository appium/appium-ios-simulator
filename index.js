// transpile:main

import { getSimulator, getDeviceString } from './lib/simulator';
import { killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert } from './lib/utils';

export { getSimulator, getDeviceString, killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert };

// transpile:main

import { getSimulator, getDeviceString } from './lib/simulator';
import { killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert } from './lib/utils';
import { BOOT_COMPLETED_EVENT } from './lib/simulator-xcode-6';

export { getSimulator, getDeviceString, killAllSimulators, endAllSimulatorDaemons, simExists, installSSLCert, uninstallSSLCert,
         BOOT_COMPLETED_EVENT };

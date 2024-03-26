// transpile:main

import { getSimulator } from './lib/simulator';
import { killAllSimulators, simExists } from './lib/utils';

export { getSimulator, killAllSimulators, simExists };

export type * from './lib/types';

import {BaseSimulator} from './base-simulator.js';
import {getSimulator} from './simulator.js';
import {createDevice, getDevices, killAllSimulators, simExists} from './utils/index.js';

// BaseSimulator is exported (rather than just the `Simulator`/`CoreSimulator` types) so consumers
// can distinguish a `Simulator` instance from some other device representation via `instanceof`,
// without checking against an arbitrary/specific XcodeNN subclass — every class `getSimulator()`
// can return extends it.
export {getSimulator, killAllSimulators, simExists, createDevice, getDevices, BaseSimulator};

export type * from './types.js';

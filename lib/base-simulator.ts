import EventEmitter from 'node:events';

/**
 * Abstract root of every concrete Simulator implementation (`SimulatorXcode15`,
 * `SimulatorXcode27`, ...). Carries no behavior of its own — it exists purely as an
 * Xcode-version-agnostic `instanceof` marker, so a consumer that needs to distinguish "is this a
 * Simulator" from some other device representation doesn't have to check against a
 * specific/arbitrary XcodeNN subclass.
 */
export abstract class BaseSimulator extends EventEmitter {}

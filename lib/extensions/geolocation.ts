import type { CoreSimulator, SupportsGeolocation } from '../types';

type CoreSimulatorWithGeolocation = CoreSimulator & SupportsGeolocation;

/**
 * Sets the geolocation for the simulator.
 *
 * @param latitude The latitude coordinate.
 * @param longitude The longitude coordinate.
 * @returns True if the geolocation was set successfully.
 */
export async function setGeolocation(this: CoreSimulatorWithGeolocation, latitude: string | number, longitude: string | number): Promise<boolean> {
  await this.simctl.setLocation(latitude, longitude);
  return true;
}


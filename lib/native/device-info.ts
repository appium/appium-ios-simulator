import {SimDeviceState} from '@appium/coresim';
import type {SimDeviceInfo} from '@appium/coresim';

import type {SimulatorListEntry} from '../types.js';

// Matches simctl/CoreSimulator's own state-name capitalization (the same strings `stat()`'s
// public contract has always documented), not a lowercase convention of this package's own.
const STATE_NAMES: Record<SimDeviceState, string> = {
  [SimDeviceState.Creating]: 'Creating',
  [SimDeviceState.Shutdown]: 'Shutdown',
  [SimDeviceState.Booting]: 'Booting',
  [SimDeviceState.Booted]: 'Booted',
  [SimDeviceState.ShuttingDown]: 'Shutting Down',
};

// e.g. 'com.apple.CoreSimulator.SimRuntime.iOS-17-4' -> {platform: 'iOS', sdk: '17.4'}. Only the
// first '-' is converted to '.' (mirroring node-simctl's own identifier parsing), so a patch
// version segment (a second/third '-') is left as-is rather than guessed at.
const RUNTIME_IDENTIFIER_PATTERN = /SimRuntime\.([A-Za-z]+)-(.+)$/;

function parseRuntimeIdentifier(runtimeIdentifier: string): {platform: string; sdk: string} {
  const match = RUNTIME_IDENTIFIER_PATTERN.exec(runtimeIdentifier);
  return match ? {platform: match[1], sdk: match[2].replace('-', '.')} : {platform: '', sdk: ''};
}

export function toSimulatorListEntry(device: SimDeviceInfo): SimulatorListEntry {
  const {platform, sdk} = parseRuntimeIdentifier(device.runtimeIdentifier);
  return {
    udid: device.udid,
    name: device.name,
    state: STATE_NAMES[device.state] ?? 'unknown',
    sdk,
    platform,
    deviceTypeIdentifier: device.deviceTypeIdentifier,
    runtimeIdentifier: device.runtimeIdentifier,
  };
}

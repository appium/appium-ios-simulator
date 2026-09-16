import type {NativeSimctl} from '@appium/coresim';

/**
 * Internal-only capability giving extension modules access to the underlying native
 * `@appium/coresim` driver. Deliberately NOT part of `CoreSimulator`/`Simulator` (see
 * `lib/types.ts`) — the native handle itself must never be exposed through the public API.
 */
export interface HasNativeSimctl {
  readonly _native: NativeSimctl;
}

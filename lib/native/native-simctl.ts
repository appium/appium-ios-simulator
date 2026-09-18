import {NativeSimctl} from '@appium/coresim';

/**
 * Builds a `NativeSimctl` bound to the given device set path (or the default device set, when
 * `null`/`undefined`). `NativeSimctl` itself is stateless/cheap to construct — it never performs
 * I/O until a method is actually called — so a fresh instance per `devicesSetPath` change is
 * simpler than trying to mutate one in place.
 */
export function createNativeSimctl(deviceSetPath?: string | null): NativeSimctl {
  return new NativeSimctl(undefined, deviceSetPath ?? undefined);
}

import {once} from 'node:events';

import type {NativeSimctl, SpawnOptions} from '@appium/coresim';

/**
 * Resolves a binary path against the guest runtime root — the host's own copy of the same binary
 * targets the wrong environment (see `@appium/coresim`'s CLAUDE.md).
 *
 * @param nativeSimctl The native driver to resolve the runtime root through.
 * @param udid UDID of the (booted) device.
 * @param relativePath Path relative to the runtime root, e.g. `bin/launchctl` or `usr/bin/defaults`.
 */
export async function resolveGuestBinary(
  nativeSimctl: NativeSimctl,
  udid: string,
  relativePath: string,
): Promise<string> {
  return `${await nativeSimctl.getRuntimeRootPath(udid)}/${relativePath}`;
}

/**
 * Resolves the path to the guest runtime's own `launchctl`. See {@link resolveGuestBinary}.
 */
export async function resolveGuestLaunchctl(nativeSimctl: NativeSimctl, udid: string): Promise<string> {
  return resolveGuestBinary(nativeSimctl, udid, 'bin/launchctl');
}

/**
 * Resolves the path to the guest runtime's own `defaults`. See {@link resolveGuestBinary}.
 */
export async function resolveGuestDefaults(nativeSimctl: NativeSimctl, udid: string): Promise<string> {
  return resolveGuestBinary(nativeSimctl, udid, 'usr/bin/defaults');
}

/**
 * Spawns a guest process via `@appium/coresim` and waits for it to exit, throwing if it exits
 * non-zero — the same "run to completion, fail loudly" contract `simctl spawn`-mediated calls
 * used to have. Unlike `NativeSimctl.spawnProcess`/the public `Simulator.spawnProcess`, `args`
 * here is just the trailing argv (POSIX argv[0], conventionally `path` itself, is filled in
 * automatically) — this is a convenience wrapper for this package's own internal spawn call
 * sites, not a faithful mirror of `simctl spawn`'s own argv convention.
 *
 * @param nativeSimctl The native driver to spawn through.
 * @param udid UDID of the target device.
 * @param path Literal path to the executable to spawn (not resolved against `$PATH`).
 * @param args Arguments to pass after argv[0].
 * @param environment Environment variables for the spawned process.
 */
export async function spawnAndWait(
  nativeSimctl: NativeSimctl,
  udid: string,
  path: string,
  args: string[] = [],
  environment?: SpawnOptions['environment'],
): Promise<void> {
  // `environment` must be omitted entirely (never passed as an explicit `undefined`) — the native
  // options-dictionary bridge chokes on that and crashes the whole process, not just this call.
  const options: SpawnOptions = environment ? {arguments: [path, ...args], environment} : {arguments: [path, ...args]};
  const proc = await nativeSimctl.spawnProcess(udid, path, options);
  let stderr = '';
  proc.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk;
  });
  const [code, signal] = await once(proc, 'exit');
  if (code !== 0) {
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    throw new Error(`'${path}' failed with ${reason}${stderr.trim() ? `: ${stderr.trim()}` : ''}`);
  }
}

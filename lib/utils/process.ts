import {log} from '../logger';
import {exec} from 'teen_process';

/**
 * @param bundleId - The bundle identifier of a running macOS application.
 * @returns The process ID or null if the application is not running.
 */
export async function getMacAppPidByBundleId(bundleId: string): Promise<string | null> {
  let stdout: string;
  try {
    ({stdout} = await exec('lsappinfo', ['info', '-only', 'pid', bundleId]));
  } catch {
    return null;
  }
  const match = stdout.trim().match(/"pid"=(\d+)/);
  return match?.[1] ?? null;
}

/**
 * @param bundleId - The bundle identifier of a running macOS application.
 * @returns True if the kill command succeeded.
 */
export async function killMacAppByBundleId(bundleId: string): Promise<boolean> {
  try {
    await exec('lsappinfo', ['kill', '-hard', bundleId]);
    return true;
  } catch (e: any) {
    log.debug(`Could not kill '${bundleId}' via lsappinfo: ${e.stderr || e.message}`);
    return false;
  }
}

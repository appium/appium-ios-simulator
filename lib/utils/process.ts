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
 * @param appName - The application name to kill.
 * @param forceKill - Whether to force kill the process.
 * @returns Promise that resolves to 0 on success.
 */
export async function pkill(appName: string, forceKill: boolean = false): Promise<number> {
  const args = forceKill ? ['-9'] : [];
  args.push('-x', appName);
  try {
    await exec('pkill', args);
    return 0;
  } catch (err: any) {
    // pgrep/pkill exit codes:
    // 0       One or more processes were matched.
    // 1       No processes were matched.
    // 2       Invalid options were specified on the command line.
    // 3       An internal error occurred.
    if (err.code !== undefined) {
      throw new Error(`Cannot forcefully terminate ${appName}. pkill error code: ${err.code}`, {
        cause: err,
      });
    }
    log.error(`Received unexpected error while trying to kill ${appName}: ${err.message}`);
    throw err;
  }
}

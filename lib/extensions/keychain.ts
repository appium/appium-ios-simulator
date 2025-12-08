import _ from 'lodash';
import path from 'path';
import { fs, mkdirp, tempDir, util } from '@appium/support';
import { exec } from 'teen_process';
import type { CoreSimulator, InteractsWithKeychain } from '../types';

type CoreSimulatorWithKeychain = CoreSimulator & InteractsWithKeychain;

/**
 * Create the backup of keychains folder.
 * The previously created backup will be automatically
 * deleted if this method was called twice in a row without
 * `restoreKeychains` being invoked.
 *
 * @returns True if the backup operation was successful.
 */
export async function backupKeychains(this: CoreSimulatorWithKeychain): Promise<boolean> {
  const resetBackupPath = async (newPath: string | null | undefined) => {
    if (_.isString(this._keychainsBackupPath) && await fs.exists(this._keychainsBackupPath)) {
      await fs.unlink(this._keychainsBackupPath);
    }
    this._keychainsBackupPath = newPath;
  };

  if (!await fs.exists(this.keychainPath) || _.isEmpty(await fs.readdir(this.keychainPath))) {
    this.log.info(`There is nothing to backup from '${this.keychainPath}'`);
    await resetBackupPath(null);
    return false;
  }

  const dstPath = await tempDir.path({
    prefix: `keychains_backup_${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`,
    suffix: '.zip',
  });
  const zipArgs = ['-r', dstPath, `${path.basename(this.keychainPath)}${path.sep}`];
  this.log.debug(`Creating keychains backup with '${util.quote(['zip', ...zipArgs])}' command`);
  try {
    await exec('zip', zipArgs, {cwd: path.dirname(this.keychainPath)});
  } catch (err: any) {
    throw new Error(
      `Cannot create keychains backup from '${this.keychainPath}'. ` +
      `Original error: ${err.stderr || err.stdout || err.message}`
    );
  }
  await resetBackupPath(dstPath);
  return true;
}

/**
 * Restore the previously created keychains backup.
 *
 * @param excludePatterns The list
 * of file name patterns to be excluded from restore. The format
 * of each item should be the same as '-x' option format for
 * 'unzip' utility. This can also be a comma-separated string,
 * which is going be transformed into a list automatically,
 * for example: '*.db*,blabla.sqlite'
 * @returns If the restore operation was successful.
 * @throws {Error} If there is no keychains backup available for restore.
 */
export async function restoreKeychains(
  this: CoreSimulatorWithKeychain,
  excludePatterns: string[] | string = []
): Promise<boolean> {
  if (!_.isString(this._keychainsBackupPath) || !await fs.exists(this._keychainsBackupPath)) {
    throw new Error(`The keychains backup archive does not exist. ` +
                    `Are you sure it was created before?`);
  }

  let patterns: string[] = [];
  if (_.isString(excludePatterns)) {
    patterns = excludePatterns.split(',').map((x) => x.trim());
  } else {
    patterns = excludePatterns;
  }
  const isServerRunning = await this.isRunning();
  let plistPath: string | undefined;
  if (isServerRunning) {
    plistPath = path.resolve(await this.getLaunchDaemonsRoot(), 'com.apple.securityd.plist');
    if (!await fs.exists(plistPath)) {
      throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
    }
    await this.simctl.spawnProcess(['launchctl', 'unload', plistPath]);
  }
  try {
    await fs.rimraf(this.keychainPath);
    await mkdirp(this.keychainPath);
    const backupPath = this._keychainsBackupPath;
    if (!backupPath) {
      throw new Error('Backup path is not set');
    }
    const unzipArgs = [
      '-o', backupPath,
      ...(_.flatMap(patterns.map((x) => ['-x', x]))),
      '-d', path.dirname(this.keychainPath),
    ];
    this.log.debug(`Restoring keychains with '${util.quote(['unzip', ...unzipArgs])}' command`);
    try {
      await exec('unzip', unzipArgs);
    } catch (err: any) {
      throw new Error(
        `Cannot restore keychains from '${backupPath}'. ` +
        `Original error: ${err.stderr || err.stdout || err.message}`
      );
    }
    await fs.unlink(backupPath);
    this._keychainsBackupPath = null;
  } finally {
    if (isServerRunning && plistPath) {
      await this.simctl.spawnProcess(['launchctl', 'load', plistPath]);
    }
  }
  return true;
}

/**
 * Clears Keychains for the particular simulator in runtime (there is no need to stop it).
 *
 * @returns Promise that resolves when keychains are cleared
 * @throws {Error} If keychain cleanup has failed.
 */
export async function clearKeychains(this: CoreSimulatorWithKeychain): Promise<void> {
  const plistPath = path.resolve(await this.getLaunchDaemonsRoot(), 'com.apple.securityd.plist');
  if (!await fs.exists(plistPath)) {
    throw new Error(`Cannot clear keychains because '${plistPath}' does not exist`);
  }
  await this.simctl.spawnProcess(['launchctl', 'unload', plistPath]);
  try {
    if (await fs.exists(this.keychainPath)) {
      await fs.rimraf(this.keychainPath);
      await mkdirp(this.keychainPath);
    }
  } finally {
    await this.simctl.spawnProcess(['launchctl', 'load', plistPath]);
  }
}


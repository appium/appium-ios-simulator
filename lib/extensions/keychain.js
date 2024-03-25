import _ from 'lodash';
import path from 'path';
import { fs, mkdirp, tempDir } from '@appium/support';
import { exec } from 'teen_process';

/**
 * Create the backup of keychains folder.
 * The previously created backup will be automatically
 * deleted if this method was called twice in a row without
 * `restoreKeychains` being invoked.
 *
 * @this {CoreSimulatorWithKeychain}
 * @returns {Promise<boolean>} True if the backup operation was successfull.
 */
export async function backupKeychains () {
  if (!await fs.exists(this.keychainPath)) {
    return false;
  }

  const backupPath = await tempDir.path({
    prefix: `keychains_backup_${Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)}`,
    suffix: '.zip',
  });
  const zipArgs = [
    '-r', backupPath,
    `${this.keychainPath}${path.sep}`
  ];
  this.log.debug(`Creating keychains backup with 'zip ${zipArgs.join(' ')}' command`);
  await exec('zip', zipArgs);
  if (_.isString(this._keychainsBackupPath) && await fs.exists(this._keychainsBackupPath)) {
    await fs.unlink(this._keychainsBackupPath);
  }
  this._keychainsBackupPath = backupPath;
  return true;
}

/**
 * Restore the previsouly created keychains backup.
 *
 * @this {CoreSimulatorWithKeychain}
 * @param {string[]} excludePatterns - The list
 * of file name patterns to be excluded from restore. The format
 * of each item should be the same as '-x' option format for
 * 'unzip' utility. This can also be a comma-separated string,
 * which is going be transformed into a list automatically,
 * for example: '*.db*,blabla.sqlite'
 * @returns {Promise<boolean>} If the restore opration was successful.
 * @throws {Error} If there is no keychains backup available for restore.
 */
export async function restoreKeychains (excludePatterns = []) {
  if (!_.isString(this._keychainsBackupPath) || !await fs.exists(this._keychainsBackupPath)) {
    throw new Error(`The keychains backup archive does not exist. ` +
                    `Are you sure it was created before?`);
  }

  if (_.isString(excludePatterns)) {
    excludePatterns = excludePatterns.split(',').map((x) => x.trim());
  }
  const isServerRunning = await this.isRunning();
  let plistPath;
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
    const unzipArgs = [
      '-o', this._keychainsBackupPath,
      ...(_.flatMap(excludePatterns.map((x) => ['-x', x]))),
      '-d', '/'
    ];
    this.log.debug(`Restoring keychains with 'unzip ${unzipArgs.join(' ')}' command`);
    await exec('unzip', unzipArgs);
    await fs.unlink(this._keychainsBackupPath);
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
 * @this {CoreSimulatorWithKeychain}
 * @returns {Promise<void>}
 * @throws {Error} If keychain cleanup has failed.
 */
export async function clearKeychains () {
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

/**
 * @typedef {import('../types').CoreSimulator & import('../types').InteractsWithKeychain} CoreSimulatorWithKeychain
 */

import { fs } from 'appium-support';
import log from '../logger';
import path from 'path';


let extensions = {};

extensions.prepareSafari = async function prepareSafari (tmpDir, platformVersion) {
  await this.prepareBuiltInApp('MobileSafari', tmpDir, platformVersion);
};

extensions.prepareBuiltInApp = async function prepareBuiltInApp (appName, tmpDir, platformVersion) {
  log.debug(`Looking for built in app '${appName}'`);
  let newAppPath = path.resolve(tmpDir, `Appium-${appName}-${platformVersion}.app`);

  let stat, appPath;
  try {
    [stat, appPath] = await this.getBuiltInApp(appName);
  } catch (err) {
    try {
      stat = await fs.stat(newAppPath);
      if (stat.isDirectory()) {
        log.debug('Could not find original app, but found the temp ' +
                     'Appium one so using that: ${}');
        return [newAppPath, appPath];
      }
    } catch (err) {
      log.warn(`App is also not at '${newAppPath}'`);
      throw new Error(`Could not find built in app '${appName}' in its home ` +
                      `or temp dir!`);
    }
  }

  if (!stat.isDirectory()) {
    throw new Error(`App found but it is not a directory: '${appPath}'`);
  }

  log.debug(`Found app, trying to move '${appPath}' to tmp dir '${tmpDir}'`);
  await this.moveBuiltInApp(appName, appPath, newAppPath);
};

extensions.getBuiltInApp = async function getBuiltInApp (appName) {
  let appDir = await this.getAppDir(appName);
  let appPath = path.resolve(appDir, `${appName}.app`);
  log.debug(`Found path for '${appName}': ${appPath}`);
  try {
    let stat = await fs.stat(appPath);
    return [stat, appPath];
  } catch (err) {
    if (err && err.message.indexOf('ENOENT') !== -1) {
      log.errorAndThrow(`App '${appName}' is not at '${appPath}'`);
    }
  }
};


export default extensions;

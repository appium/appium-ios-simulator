import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';
import { getVersion } from 'appium-xcode';
import { getDevices } from 'node-simctl';
import { fs, tempDir } from 'appium-support';
import { Certificate } from './certificate';
import path from 'path';
import Simulator from './simulator-xcode-6';
import fkill from 'fkill';


const DEFAULT_SIM_SHUTDOWN_TIMEOUT = 30000;

const BIOMETRICS = {
  touchId: 'fingerTouch',
  faceId: 'pearl',
};

function toBiometricDomainComponent (name) {
  if (!BIOMETRICS[name]) {
    throw new Error(`'${name}' is not a valid biometric. Use one of: ${JSON.stringify(_.keys(BIOMETRICS))}`);
  }
  return BIOMETRICS[name];
}

// pgrep/pkill exit codes:
// 0       One or more processes were matched.
// 1       No processes were matched.
// 2       Invalid options were specified on the command line.
// 3       An internal error occurred.

async function pkill (appName, forceKill = false) {
  let args = forceKill ? ['-9'] : [];
  args.push('-x', appName);
  try {
    await exec('pkill', args);
    return 0;
  } catch (err) {
    if (!_.isUndefined(err.code)) {
      throw new Error(`Cannot forcefully terminate ${appName}. pkill error code: ${err.code}`);
    }
    log.error(`Received unexpected error while trying to kill ${appName}: ${err.message}`);
    throw err;
  }
}

async function killAllSimulators (timeout = DEFAULT_SIM_SHUTDOWN_TIMEOUT) {
  log.debug('Killing all iOS Simulators');
  const xcodeVersion = await getVersion(true);
  const appName = xcodeVersion.major >= 7 ? 'Simulator' : 'iOS Simulator';

  // later versions are slower to close
  timeout = timeout * (xcodeVersion.major >= 8 ? 2 : 1);

  try {
    await exec('xcrun', ['simctl', 'shutdown', xcodeVersion.major > 8 ? 'all' : 'booted'], {timeout});
  } catch (ign) {}

  const pids = [];
  try {
    const {stdout} = await exec('pgrep', ['-f', `${appName}.app/Contents/MacOS/`]);
    if (stdout.trim()) {
      pids.push(...(stdout.trim().split(/\s+/)));
    }
  } catch (e) {
    if (e.code === 1) {
      log.debug(`${appName} is not running. Continuing...`);
      return;
    }
    if (_.isEmpty(pids)) {
      log.warn(`pgrep error ${e.code} while detecting whether ${appName} is running. Trying to kill anyway.`);
    }
  }
  if (!_.isEmpty(pids)) {
    log.debug(`Using fkill to kill processes: ${pids.join(', ')}`);
    try {
      await fkill(pids, {force: true});
    } catch (ign) {}
  }

  log.debug(`Using pkill to kill application: ${appName}`);
  try {
    await pkill(appName, true);
  } catch (ign) {}

  // wait for all the devices to be shutdown before Continuing
  // but only print out the failed ones when they are actually fully failed
  let remainingDevices = [];
  async function allSimsAreDown () {
    remainingDevices = [];
    let devices = await getDevices();
    devices = _.flatten(_.values(devices));
    return _.every(devices, (sim) => {
      let state = sim.state.toLowerCase();
      let done = state === 'shutdown' ||
                 state === 'unavailable' ||
                 state === 'disconnected';
      if (!done) {
        remainingDevices.push(`${sim.name} (${sim.sdk}, udid: ${sim.udid}) is still in state '${state}'`);
      }
      return done;
    });
  }
  try {
    await waitForCondition(allSimsAreDown, {
      waitMs: timeout,
      intervalMs: 200
    });
  } catch (err) {
    if (remainingDevices.length > 0) {
      log.warn(`The following devices are still not in the correct state after ${timeout} ms:`);
      for (let device of remainingDevices) {
        log.warn(`    ${device}`);
      }
    }
    throw err;
  }
}

async function endAllSimulatorDaemons () {
  log.debug('Ending all simulator daemons');
  for (let servicePattern of ['com.apple.iphonesimulator', 'com.apple.CoreSimulator']) {
    log.debug(`Killing any other ${servicePattern} daemons`);
    let launchCtlCommand = `launchctl list | grep ${servicePattern} | cut -f 3 | xargs -n 1 launchctl`;
    try {
      let stopCmd = `${launchCtlCommand} stop`;
      await exec('bash', ['-c', stopCmd]);
    } catch (err) {
      log.warn(`Could not stop ${servicePattern} daemons, carrying on anyway!`);
    }
    try {
      let removeCmd = `${launchCtlCommand} remove`;
      await exec('bash', ['-c', removeCmd]);
    } catch (err) {
      log.warn(`Could not remove ${servicePattern} daemons, carrying on anyway!`);
    }
  }
  // waiting until the simulator service has died.
  try {
    await waitForCondition(async () => {
      let {stdout} = await exec('bash', ['-c',
        `ps -e  | grep launchd_sim | grep -v bash | grep -v grep | awk {'print$1'}`]);
      return stdout.trim().length === 0;
    }, {waitMs: 5000, intervalMs: 500});
  } catch (err) {
    log.warn(`Could not end all simulator daemons, carrying on!`);
  }
  log.debug('Finishing ending all simulator daemons');
}

async function getSimulatorInfo (udid) {
  // see the README for github.com/appium/node-simctl for example output of getDevices()
  let devices = await getDevices();

  devices = _.toPairs(devices)
    .map((pair) => pair[1])
    .reduce((a, b) => a.concat(b), []);
  return _.find(devices, (sim) => sim.udid === udid);
}

async function simExists (udid) {
  return !!(await getSimulatorInfo(udid));
}

async function safeRimRaf (delPath, tryNum = 0) {
  try {
    await fs.rimraf(delPath);
  } catch (err) {
    if (tryNum < 20) {
      if (err.message.indexOf('ENOTEMPTY') !== -1) {
        log.debug(`Path '${delPath}' was not empty during delete; retrying`);
        return await safeRimRaf(delPath, tryNum + 1);
      } else if (err.message.indexOf('ENOENT') !== -1) {
        log.debug(`Path '${delPath}' did not exist when we tried to delete, ignoring`);
        return await safeRimRaf(delPath, tryNum + 1);
      }
    }
  }
}

/**
 * Install an SSL certificate to a device with given udid
 * @param {string} pemText SSL pem text
 * @param {string} udid Identifier of the Simulator
 */
async function installSSLCert (pemText, udid) {
  // Check that openssl is installed on the path
  try {
    await fs.which('openssl');
  } catch (e) {
    log.debug(`customSSLCert requires openssl to be available on path`);
    log.errorAndThrow(`Command 'openssl' not found`);
  }

  // Check that sqlite3 is installed on the path
  try {
    await fs.which('sqlite3');
  } catch (e) {
    log.debug(`customSSLCert requires sqlite3 to be available on path`);
    log.errorAndThrow(`Command 'sqlite3' not found`);
  }

  // Create a temporary file to store PEM text
  // (a temp file is necessary to run `openssl` shell commands, can't be done in memory)
  let tempFileName = path.resolve(await tempDir.openDir(), 'temp-ssl-cert.pem');
  let pathToKeychain = new Simulator(udid).getDir();
  await fs.writeFile(tempFileName, pemText);
  try {
    await fs.stat(pathToKeychain);
  } catch (e) {
    log.debug(`Could not install SSL certificate. No simulator with udid '${udid}'`);
    log.errorAndThrow(e);
  }

  // Do the certificate installation
  let certificate = new Certificate(tempFileName);
  log.debug(`Installing certificate to ${pathToKeychain}`);
  await certificate.add(pathToKeychain);

  // Remove the temporary file
  await fs.unlink(tempFileName);

  return certificate;
}

async function uninstallSSLCert (pemText, udid) {
  try {
    let tempFileName = path.resolve(__dirname, 'temp-ssl-cert.pem');
    let pathToKeychain = path.resolve(new Simulator(udid).getDir());
    await fs.writeFile(tempFileName, pemText);
    let certificate = new Certificate(tempFileName);
    await certificate.remove(pathToKeychain);
    await fs.unlink(tempFileName);
    return certificate;
  } catch (e) {
    log.debug(`Could not uninstall SSL certificate. No simulator with udid '${udid}'`);
    log.errorAndThrow(e);
  }
}

/**
 * Check if the Simulator already has this SSL certificate
 * @param {string} pemText PEM text of SSL cert
 * @param {string} udid Identifier of the Simulator
 */
async function hasSSLCert (pemText, udid) {
  const tempFileName = path.resolve(await tempDir.openDir(), 'temp-ssl-cert.pem');
  const pathToKeychain = new Simulator(udid).getDir();
  await fs.writeFile(tempFileName, pemText);
  const certificate = new Certificate(tempFileName);
  return certificate.has(pathToKeychain);
}

/**
 * Runs a command line sqlite3 query
 *
 * @param {string} db - Full path to sqlite database
 * @param {string} query - The actual query string
 * @param {...string} queryParams - The list of query parameters
 * @returns {string} sqlite command stdout
 */
async function execSQLiteQuery (db, query, ...queryParams) {
  query = query.replace(/\n+/g, ' ');
  let queryTokens = query.split('?');
  let formattedQuery = [];
  queryParams
    .map((param) => `${param}`)
    .forEach((param, i) => {
      formattedQuery.push(queryTokens[i]);
      formattedQuery.push(param.replace(/'/g, "''"));
    });
  formattedQuery.push(queryTokens[queryTokens.length - 1]);

  log.debug(`Executing SQL query "${formattedQuery.join('')}" on '${db}'`);
  try {
    return (await exec('sqlite3', ['-line', db, formattedQuery.join('')])).stdout;
  } catch (err) {
    throw new Error(`Cannot execute SQLite query "${formattedQuery.join('')}" to '${db}'. ` +
      `Original error: ${err.stderr}`);
  }
}

async function getDeveloperRoot () {
  const {stdout} = await exec('xcode-select', ['-p']);
  return stdout.trim();
}

export {
  killAllSimulators,
  endAllSimulatorDaemons,
  safeRimRaf,
  simExists,
  getSimulatorInfo,
  installSSLCert,
  uninstallSSLCert,
  hasSSLCert,
  execSQLiteQuery,
  toBiometricDomainComponent,
  getDeveloperRoot,
};

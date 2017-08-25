import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';
import { getVersion } from 'appium-xcode';
import { getDevices } from 'node-simctl';
import { fs } from 'appium-support';
import { Certificate } from './certificate';
import path from 'path';
import Simulator from './simulator-xcode-6';
import fkill from 'fkill';


const DEFAULT_SIM_SHUTDOWN_TIMEOUT = 30000;

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
  timeout = timeout * (xcodeVersion.major === 8 ? 2 : 1);

  let pids;
  try {
    let {stdout} = await exec('pgrep', ['-x', appName]);
    pids = stdout.trim().split('\n').map((pid) => parseInt(pid, 10));
  } catch (e) {
    if (e.code === 1) {
      log.debug(`${appName} is not running. Continuing...`);
      return;
    }
    log.warn(`pgrep error ${e.code} while detecting whether ${appName} is running. Trying to kill anyway.`);
  }

  await (async function performKill (pids = []) {
    try {
      await exec('xcrun', ['simctl', 'shutdown', 'booted'], {timeout});
    } catch (ign) {}

    if (pids.length) {
      log.debug(`Using fkill to kill processes: ${pids.join(', ')}`);
      try {
        await fkill(pids, {force: true});
      } catch (ign) {}
    } else {
      log.debug(`Using pkill to kill application: ${appName}`);
      await pkill(appName, true);
    }
  })(pids);

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

async function simExists (udid) {
  // see the README for github.com/appium/node-simctl for example output of getDevices()
  let devices = await getDevices();

  devices = _.toPairs(devices).map((pair) => {
    return pair[1];
  }).reduce((a, b) => {
    return a.concat(b);
  }, []);
  return !!_.find(devices, (sim) => {
    return sim.udid === udid;
  });
}

async function safeRimRaf (delPath, tryNum = 0) {
  try {
    await fs.rimraf(delPath);
  } catch (err) {
    if (tryNum < 20) {
      if (err.message.indexOf('ENOTEMPTY') !== -1) {
        log.debug(`Path '${delPath}' was not empty during delete; retrying`);
        return safeRimRaf(delPath, tryNum + 1);
      } else if (err.message.indexOf('ENOENT') !== -1) {
        log.debug(`Path '${delPath}'' did not exist when we tried to delete, ignoring`);
        return safeRimRaf(delPath, tryNum + 1);
      }
    }
  }
}

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

  let tempFileName = path.resolve(`${__dirname}/temp-ssl-cert.pem`);
  let pathToKeychain = path.resolve(new Simulator(udid).getDir());
  await fs.writeFile(tempFileName, pemText);
  try {
    await fs.stat(pathToKeychain);
  } catch (e) {
    log.debug(`Could not install SSL certificate. No simulator with udid '${udid}'`);
    log.errorAndThrow(e);
  }
  let certificate = new Certificate(tempFileName);
  log.debug(`Installing certificate to ${pathToKeychain}`);
  await certificate.add(pathToKeychain);
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
 * Runs a command line sqlite3 query
 */
async function execSQLiteQuery (db, query, ...queryParams) {
  let queryTokens = query.split('?');
  let formattedQuery = [];
  queryParams.forEach((param, i) => {
    formattedQuery.push(queryTokens[i]);
    formattedQuery.push(param.replace(/'/g, "''"));
  });
  formattedQuery.push(queryTokens[queryTokens.length - 1]);

  return await exec('sqlite3', ['-line', db, formattedQuery.join('')]);
}

export { killAllSimulators, endAllSimulatorDaemons, safeRimRaf, simExists, installSSLCert, uninstallSSLCert, execSQLiteQuery };

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

const OSASCRIPT_TIMEOUT = 10000;

async function killAllSimulators (timeout = OSASCRIPT_TIMEOUT) {
  log.debug('Killing all iOS Simulators');

  let appName;
  let xcodeVersion = await getVersion(true);
  if (xcodeVersion.major >= 7) {
    appName = 'Simulator';
  } else {
    appName = 'iOS Simulator';
  }

  try {
    await exec('osascript', ['-e', `quit app "${appName}"`], {timeout});
  } catch (e) {
    let errString = JSON.stringify(e);
    if (errString.match(/Application isn.t running/)) {
      // on some systems we get an error that the application is not running
      log.debug('Application is not running. Continuing');
    } else if (e.message.match(/timed out/)) {
      // sometimes, especially in xcode 8, the sim hangs
      log.debug('Killing simulator timed out. Using killall signal');
      await exec('killall', [appName]);
    } else {
      log.errorAndThrow(e);
    }
  }

  // wait for all the devices to be shutdown before Continuing
  // but only print out the failed ones when they are actually fully failed
  let remainingDevices;
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
        remainingDevices.push(`Simulator not shut down: ${sim.name} (${sim.sdk}, udid: ` +
                              `${sim.udid}) is still in state '${state}'`);
      }
      return done;
    });
  }
  try {
    await waitForCondition(allSimsAreDown, {
      waitMs: 60 * 1000,
      intervalMs: 200
    });
  } catch (err) {
    if (remainingDevices && remainingDevices.length !== 0) {
      log.error('The following devices are not in the correct state:');
      for (let device of remainingDevices) {
        log.error(`    ${device}`);
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

  let tempFileName = path.resolve(__dirname, 'temp-ssl-cert.pem');
  let pathToKeychain = new Simulator(udid).getDir();
  await fs.writeFile(tempFileName, pemText);
  try {
    await fs.stat(pathToKeychain);
  } catch (e) {
    log.debug(`Could not install SSL certificate. No simulator with udid '${udid}'`);
    log.errorAndThrow(e);
  }
  let certificate = new Certificate(tempFileName);
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

export { killAllSimulators, endAllSimulatorDaemons, safeRimRaf, simExists, installSSLCert, uninstallSSLCert };

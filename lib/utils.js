import log from './logger';
import _ from 'lodash';
import { exec } from 'teen_process';
import { waitForCondition } from 'asyncbox';
import { getVersion } from 'appium-xcode';
import { getDevices } from 'node-simctl';
import { fs } from 'appium-support';


async function killAllSimulators () {
  log.debug('Killing all iOS Simulators');

  let appName;
  let xcodeVersion = await getVersion(true);
  if (xcodeVersion.major === 7) {
    appName = 'Simulator';
  } else {
    appName = 'iOS Simulator';
  }

  try {
    await exec('osascript', ['-e', `quit app "${appName}"`]);
  } catch (e) {
    // on some systems we get an error that the application is not running
    if (JSON.stringify(e).match(/Application isn.t running/)) {
      log.debug('Application is not running. Continuing');
    } else {
      log.errorAndThrow(e);
    }
  }

  async function allSimsAreShutDown () {
    let devices = await getDevices();
    devices = _.flatten(_.values(devices));
    return _.every(devices, (sim) => {
      return sim.state === 'Shutdown';
    });
  }

  await waitForCondition(allSimsAreShutDown, {
    waitMs: 60 * 1000,
    intervalMs: 200
  });
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

export { killAllSimulators, endAllSimulatorDaemons, safeRimRaf, simExists };

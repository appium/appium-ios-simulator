import { SubProcess } from 'teen_process';
import B from 'bluebird';
import log from './logger';

// tails a file, promise resolves when input string is written to file
async function tailUntil (filePath, until, timeout = 5000) {
  let proc = new SubProcess('tail', ['-f', '-n', '100', filePath]);

  // // for debugging
  // function consoleOut (...args) {
  //   console.log(`>>> ${args}`); // eslint-disable-line no-console
  // }
  // proc.on('output', consoleOut);

  let startDetector = (stdout) => {
    return stdout.indexOf(until) > -1;
  };

  return await new B((resolve, reject) => {
    let started = proc.start(startDetector);

    /* eslint-disable promise/prefer-await-to-then */
    let timedout = B.delay(timeout).then(() => {
      return reject(new Error(`Tailing file ${filePath} failed after ${timeout}ms`));
    });
    /* eslint-enable */

    B.race([started, timedout]).then(resolve).catch(reject);
  }).finally(async () => {
    // no matter what, stop the tail process
    if (proc.isRunning) {
      try {
        await proc.stop();
      } catch (err) {
        // there is not much we can do here, unfortunately, but log
        log.info(`Stopping tail process failed: ${err.message}`);
      }
    }
  });
}

export { tailUntil };

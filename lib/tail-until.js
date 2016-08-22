import { SubProcess } from 'teen_process';
import B from 'bluebird';

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

  return new B(async (resolve, reject) => {
    let started = proc.start(startDetector);
    let timedout = B.delay(timeout).then(() => {
      return reject(`tailing file ${filePath} failed after ${timeout}ms`);
    });

    await B.race([started, timedout]);

    resolve();
  }).finally(() => {
    // no matter what, stop the tail process
    proc.stop();
  });
}

export { tailUntil };

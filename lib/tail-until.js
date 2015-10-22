import { SubProcess } from 'teen_process';
import B from 'bluebird';

// tails a file, promise resolves when input string is written to file
async function tailUntil(filePath, until, timeout = 5000) {
  let proc = new SubProcess('tail', ['-f', '-n', '0', filePath]);

  let startDetector = (stdout) => {
    return stdout.indexOf(until) > -1;
  };

  let started = proc.start(startDetector);
  let timedout = B.delay(timeout).then(() => {
    return B.reject(`tailing file ${filePath} failed after ${timeout}ms`);
  });

  await B.race([started, timedout]);

  proc.stop();
  return;
}

export { tailUntil };

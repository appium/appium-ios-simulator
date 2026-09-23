import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {describe, it, before, after} from 'node:test';
import {fileURLToPath} from 'node:url';

import {exec} from 'teen_process';

import {getSimulator} from '../../lib/simulator.js';
import {getUiClientAppPath, killAllSimulators} from '../../lib/utils/index.js';
import {LONG_TIMEOUT} from './helpers.js';
import {createTestDevice, deleteTestDevice} from './native-test-helpers.js';

const OS_VERSION = process.env.MOBILE_OS_VERSION || '26.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 17';

const WORKER_PATH = fileURLToPath(new URL('./ui-client-cross-process-worker.js', import.meta.url));

interface WorkerResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs the worker script as its own Node.js process, booting `udid` with a visible UI client. */
function runWorker(udid: string, startupTimeout: number): Promise<WorkerResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER_PATH, udid, String(startupTimeout)]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({code, stdout, stderr}));
  });
}

/**
 * Regression test for https://github.com/appium/appium-ios-simulator/issues/506: reproduces the
 * bug's actual shape (separate OS processes, each with their own in-memory AsyncLock, booting
 * concurrently) rather than concurrent calls within a single process, which the in-process lock
 * already serialized before the cross-process file lock in ui-client.ts existed.
 *
 * Skipped in CI: booting two real simulators from scratch, twice (this suite creates its own
 * devices), is slow and prone to hosted-runner timeouts. Meant to be run locally.
 */
(process.env.CI ? describe.skip : describe)('UI client cross-process locking', function () {
  const udids: string[] = [];

  before(async function () {
    await killAllSimulators();
    for (let i = 0; i < 2; i++) {
      udids.push(await createTestDevice(`appium-ios-simulator-cross-process-test-${i}`, DEVICE_NAME, OS_VERSION));
    }
  });

  after(async function () {
    await killAllSimulators();
    await Promise.all(udids.map((udid) => deleteTestDevice(udid)));
  });

  it('shares a single UI client window between two separate processes booting concurrently', async function () {
    const [first, second] = await Promise.all(udids.map((udid) => runWorker(udid, LONG_TIMEOUT)));

    assert.strictEqual(first.code, 0, `first worker failed: ${first.stderr}`);
    assert.strictEqual(second.code, 0, `second worker failed: ${second.stderr}`);

    const firstResult = JSON.parse(first.stdout);
    const secondResult = JSON.parse(second.stdout);
    assert.ok(firstResult.uiClientPid, 'expected the first process to observe a UI client PID');
    assert.strictEqual(
      secondResult.uiClientPid,
      firstResult.uiClientPid,
      'expected both processes to observe the same, shared UI client PID',
    );

    // The PID equality check above can't catch a case where getMacAppPidByPath's `pgrep -f`
    // happens to report the same (e.g. first-listed) PID to both callers despite a second UI
    // client process also being alive, so count matching processes directly.
    const sim = await getSimulator(udids[0]);
    const uiClientAppPath = await getUiClientAppPath(sim.uiClientBundleId, sim.xcodeVersion);
    const {stdout} = await exec('pgrep', ['-f', uiClientAppPath]);
    const uiClientPidCount = stdout.trim().split('\n').filter(Boolean).length;
    assert.strictEqual(uiClientPidCount, 1, 'expected exactly one UI client process to be running');
  });
});

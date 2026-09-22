import assert from 'node:assert/strict';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';

import {util} from '@appium/support';
import sinon from 'sinon';

mock.module('../../lib/extensions/settings.js', {
  namedExports: {
    compileSimulatorPreferences: () => [{}, {}],
    updatePreferences: async () => true,
  },
});

const {run} = await import('../../lib/extensions/ui-client.js');

function lockFilePathFor(uiClientBundleId: string): string {
  return path.join(os.tmpdir(), `appium-ios-simulator-ui-client-${uiClientBundleId}.lock`);
}

function makeFakeSim(uiClientBundleId: string, sandbox: sinon.SinonSandbox) {
  return {
    udid: 'FAKE-UDID',
    uiClientBundleId,
    startupTimeout: 1000,
    log: {debug() {}, info() {}, warn() {}},
    isRunning: sandbox.stub().resolves(false),
    getUIClientPid: sandbox.stub().resolves(null),
    launchWindow: sandbox.stub().resolves(),
    waitForBoot: sandbox.stub().resolves(),
    disableKeyboardIntroduction: sandbox.stub().resolves(),
  };
}

describe('ui-client', function () {
  let sandbox: sinon.SinonSandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });
  afterEach(function () {
    sandbox.restore();
  });

  describe('run', function () {
    it('holds a lock file, observable from an independent guard, for the duration of the UI client launch', async function () {
      const uiClientBundleId = 'com.apple.test.ui-client-lock-spec';
      const lockFilePath = lockFilePathFor(uiClientBundleId);
      await fsPromises.rm(lockFilePath, {force: true});
      // Standing in for the lock guard a separate Appium server process would construct on its own.
      const independentGuard = util.getLockFileGuard(lockFilePath);

      const fakeSim = makeFakeSim(uiClientBundleId, sandbox);
      let lockedDuringLaunch: boolean | undefined;
      fakeSim.launchWindow.callsFake(async () => {
        lockedDuringLaunch = await independentGuard.check();
      });

      await run.call(fakeSim as any, {});

      assert.strictEqual(lockedDuringLaunch, true);
      assert.strictEqual(await independentGuard.check(), false);
    });

    it('prevents two concurrent callers from launching the UI client at the same time', async function () {
      const uiClientBundleId = 'com.apple.test.ui-client-lock-spec-concurrent';
      await fsPromises.rm(lockFilePathFor(uiClientBundleId), {force: true});

      let concurrentLaunches = 0;
      let maxConcurrentLaunches = 0;
      const onLaunch = async () => {
        concurrentLaunches++;
        maxConcurrentLaunches = Math.max(maxConcurrentLaunches, concurrentLaunches);
        await new Promise((resolve) => setTimeout(resolve, 50));
        concurrentLaunches--;
      };
      const firstSim = makeFakeSim(uiClientBundleId, sandbox);
      firstSim.launchWindow.callsFake(onLaunch);
      const secondSim = makeFakeSim(uiClientBundleId, sandbox);
      secondSim.launchWindow.callsFake(onLaunch);

      await Promise.all([run.call(firstSim as any, {}), run.call(secondSim as any, {})]);

      assert.strictEqual(maxConcurrentLaunches, 1);
    });
  });
});

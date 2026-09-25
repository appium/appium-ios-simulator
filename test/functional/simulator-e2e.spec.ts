import assert from 'node:assert/strict';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it, before, after} from 'node:test';
import type {TestContext} from 'node:test';

import {NativeSimUnavailableError} from '@appium/coresim';
import {retryInterval, waitForCondition} from 'asyncbox';

import {getSimulator} from '../../lib/simulator.js';
import type {Simulator} from '../../lib/types.js';
import {killAllSimulators, MOBILE_SAFARI_BUNDLE_ID} from '../../lib/utils/index.js';
import {getUIKitCatalogPath, UICATALOG_BUNDLE_ID} from '../setup.js';
import {createSelfSignedCertContent, createTestPhoto} from './fixtures.js';
import {ciScale, LONG_TIMEOUT} from './helpers.js';
import {createTestDevice, deleteTestDevice} from './native-test-helpers.js';

const OS_VERSION = process.env.MOBILE_OS_VERSION || '26.0';
const DEVICE_NAME = process.env.MOBILE_DEVICE_NAME || 'iPhone 17';

/**
 * Every test in the main describe block below runs against ONE device, created and booted once
 * in `before()` and torn down once in `after()` — mirroring @appium/coresim's own integration
 * suite (test/integration/coresim-integration.spec.ts), which shares a single boot cycle per
 * runtime instead of paying create+boot+delete costs per test/describe block. Tests are ordered
 * roughly by increasing "destructiveness" to shared state, and only genuinely incompatible
 * scenarios (a second device, a custom device set, killing every simulator) get their own
 * dedicated device below.
 */
describe(`Simulator ${DEVICE_NAME} / iOS ${OS_VERSION} (shared instance)`, function () {
  let udid: string;
  let sim: Simulator;
  let customApp: string;

  before(async function () {
    await killAllSimulators();
    customApp = await getUIKitCatalogPath();
    udid = await createTestDevice('appium-ios-simulator-test', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
  });

  after(async function () {
    await killAllSimulators();
    await deleteTestDevice(udid);
  });

  it('is fresh and shut down before ever being run', async function () {
    assert.strictEqual(await sim.isFresh(), true);
    assert.strictEqual(await sim.isShutdown(), true);
    assert.strictEqual(await sim.isRunning(), false);
  });

  it('boots with the UI client and reports as running and no longer fresh', async function () {
    await sim.run({startupTimeout: LONG_TIMEOUT});
    assert.strictEqual(await sim.isRunning(), true);
    assert.strictEqual(await sim.isFresh(), false);
    assert.strictEqual((await sim.stat()).state, 'Booted');
    assert.ok((await sim.getPlatformVersion()).length > 0);
  });

  it('re-wraps the same udid via getSimulator and reflects the already-booted state', async function () {
    const rewrapped = await getSimulator(udid);
    assert.strictEqual((await rewrapped.stat()).state, 'Booted');
    assert.strictEqual(await rewrapped.isRunning(), true);
  });

  describe('UI client', function () {
    it('reports the UI client as running with a real PID', async function () {
      assert.strictEqual(await sim.isUIClientRunning(), true);
      const pid = await sim.getUIClientPid();
      assert.strictEqual(typeof pid, 'string');
      assert.notStrictEqual(pid, '');
    });
  });

  describe('apps', function () {
    it('installs, inspects, and finds the app by bundle name', async function () {
      await sim.installApp(customApp);
      assert.strictEqual(await sim.isAppInstalled(UICATALOG_BUNDLE_ID), true);

      const info = await sim.appInfo(UICATALOG_BUNDLE_ID);
      assert.strictEqual(info.CFBundleIdentifier, UICATALOG_BUNDLE_ID);

      const appContainer = await sim.getAppContainer(UICATALOG_BUNDLE_ID);
      assert.strictEqual(appContainer, info.Path);

      assert.deepStrictEqual(await sim.getUserInstalledBundleIdsByBundleName('UIKitCatalog'), [UICATALOG_BUNDLE_ID]);
    });

    it('launches, lists, and terminates the app', async function () {
      await retryInterval(5, 1000, async () => {
        await sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true});
      });
      assert.strictEqual(await sim.isAppRunning(UICATALOG_BUNDLE_ID), true);

      const processes = await sim.ps();
      assert.ok(processes.some(({name}) => name === UICATALOG_BUNDLE_ID));

      await sim.terminateApp(UICATALOG_BUNDLE_ID);
      await waitForCondition(async () => !(await sim.isAppRunning(UICATALOG_BUNDLE_ID)), {
        waitMs: ciScale(10000),
        intervalMs: 300,
      });
    });

    it('scrubs the app, wiping its data container', async function () {
      await sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true});
      await sim.scrubApp(UICATALOG_BUNDLE_ID);
      assert.strictEqual(await sim.isAppRunning(UICATALOG_BUNDLE_ID), false);
    });

    it('removes the app, which is then no longer installed or launchable', async function () {
      await sim.removeApp(UICATALOG_BUNDLE_ID);
      assert.strictEqual(await sim.isAppInstalled(UICATALOG_BUNDLE_ID), false);
      await assert.rejects(sim.launchApp(UICATALOG_BUNDLE_ID, {wait: true}));
    });
  });

  describe('permissions', function () {
    const bundleId = 'com.appium.ios-simulator.doesnotexist';

    it('grants, revokes, and resets a native TCC-backed permission', async function () {
      assert.strictEqual(await sim.getPermission(bundleId, 'contacts'), 'unset');

      await sim.setPermission(bundleId, 'contacts', 'yes');
      assert.strictEqual(await sim.getPermission(bundleId, 'contacts'), 'yes');

      await sim.setPermission(bundleId, 'contacts', 'no');
      assert.strictEqual(await sim.getPermission(bundleId, 'contacts'), 'no');

      await sim.setPermission(bundleId, 'contacts', 'unset');
      assert.strictEqual(await sim.getPermission(bundleId, 'contacts'), 'unset');
    });

    it('grants several services in one call via setPermissions', async function () {
      await sim.setPermissions(bundleId, {camera: 'yes', microphone: 'yes'});
      assert.strictEqual(await sim.getPermission(bundleId, 'camera'), 'yes');
      assert.strictEqual(await sim.getPermission(bundleId, 'microphone'), 'yes');
      await sim.setPermissions(bundleId, {camera: 'unset', microphone: 'unset'});
    });

    it('grants, revokes, and resets location via the xcrun simctl privacy carve-out', async function () {
      // location has no state-reading equivalent (see permissions.ts), so this only exercises
      // that each action completes without throwing.
      await assert.doesNotReject(sim.setPermission(bundleId, 'location', 'yes'));
      await assert.doesNotReject(sim.setPermission(bundleId, 'location', 'no'));
      await assert.doesNotReject(sim.setPermission(bundleId, 'location', 'unset'));
      await assert.rejects(sim.setPermission(bundleId, 'location', 'unsupported'));
    });

    it('grants, revokes, and resets faceid and userTracking, two services with no dedicated setter', async function () {
      for (const service of ['faceid', 'userTracking']) {
        assert.strictEqual(await sim.getPermission(bundleId, service), 'unset');

        await sim.setPermission(bundleId, service, 'yes');
        assert.strictEqual(await sim.getPermission(bundleId, service), 'yes');

        await sim.setPermission(bundleId, service, 'no');
        assert.strictEqual(await sim.getPermission(bundleId, service), 'no');

        await sim.setPermission(bundleId, service, 'unset');
        assert.strictEqual(await sim.getPermission(bundleId, service), 'unset');
      }
    });

    it('grants "limited" (selected photos) access, exclusively for the photos service', async function () {
      await sim.setPermission(bundleId, 'photos', 'limited');
      assert.strictEqual(await sim.getPermission(bundleId, 'photos'), 'limited');
      await sim.setPermission(bundleId, 'photos', 'unset');

      await assert.rejects(
        sim.setPermission(bundleId, 'camera', 'limited'),
        /only a valid status for the 'photos' service/,
      );
    });
  });

  describe('biometric', function () {
    it('enrolls, un-enrolls, and sends matches', async function () {
      assert.strictEqual(await sim.isBiometricEnrolled(), false);

      await sim.enrollBiometric(true);
      assert.strictEqual(await sim.isBiometricEnrolled(), true);

      await assert.doesNotReject(sim.sendBiometricMatch(true, 'touchId'));
      await assert.doesNotReject(sim.sendBiometricMatch(false, 'faceId'));

      await sim.enrollBiometric(false);
      assert.strictEqual(await sim.isBiometricEnrolled(), false);
    });
  });

  describe('UI settings', function () {
    it('gets and sets appearance', async function () {
      const original = await sim.getAppearance();
      try {
        await sim.setAppearance('dark');
        assert.strictEqual(await sim.getAppearance(), 'dark');
        await sim.setAppearance('light');
        assert.strictEqual(await sim.getAppearance(), 'light');
      } finally {
        await sim.setAppearance(original === 'dark' ? 'dark' : 'light');
      }
    });

    it('gets and sets increase contrast', async function () {
      await sim.setIncreaseContrast('enabled');
      assert.strictEqual(await sim.getIncreaseContrast(), 'enabled');
      await sim.setIncreaseContrast('disabled');
      assert.strictEqual(await sim.getIncreaseContrast(), 'disabled');
    });

    it('gets and sets content size', async function () {
      await sim.setContentSize('large');
      assert.strictEqual(await sim.getContentSize(), 'large');
      await sim.setContentSize('extra-small');
      assert.strictEqual(await sim.getContentSize(), 'extra-small');
      // restore a sane default for anything that runs after this
      await sim.setContentSize('large');
    });
  });

  describe('geolocation', function () {
    it('sets the simulated location', async function () {
      assert.strictEqual(await sim.setGeolocation(37.7749, -122.4194), true);
      assert.strictEqual(await sim.setGeolocation('37.7749', '-122.4194'), true);
    });
  });

  describe('keychain', function () {
    it('adds a certificate (keychain and trusted root)', async function () {
      const certContent = await createSelfSignedCertContent();
      await assert.doesNotReject(sim.addCertificate(certContent, {isRoot: false}));
      await assert.doesNotReject(sim.addCertificate(certContent, {isRoot: true}));
    });

    it('backs up, restores, and clears the keychain', async function () {
      const backedUp = await sim.backupKeychains();
      assert.strictEqual(typeof backedUp, 'boolean');
      if (backedUp) {
        assert.strictEqual(await sim.restoreKeychains(['*.db*']), true);
      }
      await assert.doesNotReject(sim.clearKeychains());
    });
  });

  describe('screenshot', function () {
    it('captures a screenshot in PNG (default) and JPEG', async function () {
      const png = await sim.getScreenshot();
      assert.deepStrictEqual(png.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      const jpeg = await sim.getScreenshot({format: 'jpeg'});
      assert.deepStrictEqual(jpeg.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
    });

    it('encodes a lower JPEG quality to a smaller buffer than a higher one', async function () {
      const lowQuality = await sim.getScreenshot({format: 'jpeg', quality: 10});
      const highQuality = await sim.getScreenshot({format: 'jpeg', quality: 95});
      assert.ok(lowQuality.length < highQuality.length, 'expected a lower JPEG quality to encode smaller');
    });
  });

  describe('video recording', function () {
    // The default (no `audio`/`fps`) recording path drives CoreSimulator's own private recorder,
    // which is only available on Xcode 26+ — the functional-test matrix also runs against older
    // Xcode versions, where this rejects with NativeSimUnavailableError instead of recording.
    it('records the display to a file', async function (this: TestContext) {
      const outputFile = path.join(os.tmpdir(), `appium-ios-simulator-recording-${Date.now()}.mov`);
      assert.strictEqual(await sim.isVideoRecording(), false);
      try {
        await sim.startVideoRecording(outputFile);
      } catch (err) {
        if (err instanceof NativeSimUnavailableError) {
          return this.skip(`video recording unavailable on this CoreSimulator: ${(err as Error).message}`);
        }
        throw err;
      }
      try {
        assert.strictEqual(await sim.isVideoRecording(), true);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        await sim.stopVideoRecording();
        assert.strictEqual(await sim.isVideoRecording(), false);
        const {size} = await fs.stat(outputFile);
        assert.ok(size > 0, 'expected the recorded file to be non-empty');
      } finally {
        await fs.rm(outputFile, {force: true});
      }
    });

    it('rejects a second concurrent recording on the same device', async function (this: TestContext) {
      const outputFile = path.join(os.tmpdir(), `appium-ios-simulator-recording-${Date.now()}.mov`);
      try {
        await sim.startVideoRecording(outputFile);
      } catch (err) {
        if (err instanceof NativeSimUnavailableError) {
          return this.skip(`video recording unavailable on this CoreSimulator: ${(err as Error).message}`);
        }
        throw err;
      }
      try {
        await assert.rejects(sim.startVideoRecording(outputFile));
      } finally {
        await sim.stopVideoRecording();
        await fs.rm(outputFile, {force: true});
      }
    });
  });

  describe('video streaming', function () {
    it('streams an encoded H.264 access unit from the display', async function () {
      const stream = await sim.startVideoStream({fps: 15});
      try {
        assert.strictEqual(stream.codec, 'h264');
        // fps is only a polling upper bound — coresim skips encoding an unchanged frame, so a
        // static screen can otherwise stall this indefinitely. A single unit within a bounded
        // deadline is enough to prove the pipeline works; `break` stops the generator (and its
        // underlying poll) as soon as it arrives instead of waiting for more.
        let unit;
        for await (const u of stream.accessUnits(AbortSignal.timeout(ciScale(15000)))) {
          unit = u;
          break;
        }
        assert.ok(unit, 'expected at least one access unit before the deadline');
        assert.strictEqual(unit.track, 'video');
        assert.ok(Buffer.isBuffer(unit.data));
        assert.strictEqual(typeof unit.isKeyFrame, 'boolean');
      } finally {
        await stream.stop();
      }
    });
  });

  describe('JPEG streaming', function () {
    it('streams a JPEG frame from the display', async function () {
      const stream = await sim.startJpegStream({fps: 15});
      try {
        // Same bounded-first-frame rationale as the video streaming test above.
        let frame;
        for await (const f of stream.frames(AbortSignal.timeout(ciScale(15000)))) {
          frame = f;
          break;
        }
        assert.ok(frame, 'expected at least one frame before the deadline');
        assert.ok(Buffer.isBuffer(frame.data));
        assert.deepStrictEqual(frame.data.subarray(0, 3), Buffer.from([0xff, 0xd8, 0xff]));
      } finally {
        await stream.stop();
      }
    });
  });

  describe('media', function () {
    it('adds a photo to the Photos library', async function () {
      const photoPath = await createTestPhoto();
      try {
        await assert.doesNotReject(sim.addMedia([photoPath]));
      } finally {
        await fs.rm(photoPath, {force: true});
      }
    });
  });

  describe('push notification', function () {
    it('delivers a simulated push notification', async function () {
      await assert.doesNotReject(
        sim.pushNotification({
          'Simulator Target Bundle': 'com.apple.Preferences',
          aps: {alert: 'test notification', badge: 1, sound: 'default'},
        }),
      );
    });
  });

  describe('guest process spawn', function () {
    it('spawns a process with live stdout and reports a clean exit', async function () {
      const proc = await sim.spawnProcess('/bin/df', {arguments: ['/bin/df', '-h']});
      let stdout = '';
      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk;
      });
      const [[code, signal]] = await Promise.all([once(proc, 'exit'), once(proc.stdout, 'end')]);
      assert.deepStrictEqual({code, signal}, {code: 0, signal: null});
      assert.match(stdout, /Filesystem/);
    });

    it('kills a long-running spawned process', async function () {
      const proc = await sim.spawnProcess('/usr/bin/log', {arguments: ['/usr/bin/log', 'stream']});
      proc.stdout.resume();
      const exitPromise = once(proc, 'exit');
      assert.ok(proc.kill());
      const [code, signal] = await exitPromise;
      assert.deepStrictEqual({code, signal}, {code: null, signal: 'SIGTERM'});
    });
  });

  describe('Safari', function () {
    it('opens a URL and reports Safari as running', async function () {
      await sim.openUrl('https://apple.com');
      assert.strictEqual(await sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID), true);
    });

    it('locates the WebInspector socket', async function () {
      const socket = await sim.getWebInspectorSocket();
      assert.ok(socket);
      assert.match(socket, /com\.apple\.webinspectord_sim\.socket$/);
    });

    it('sets arbitrary Safari preferences', async function () {
      assert.strictEqual(
        await sim.updateSafariSettings({
          ShowTabBar: 1,
          DidImportBuiltinBookmarks: 1,
        }),
        true,
      );
    });

    it('scrubs Safari', async function () {
      await sim.scrubSafari();
      assert.strictEqual(await sim.isAppRunning(MOBILE_SAFARI_BUNDLE_ID), false);
    });
  });

  describe('settings', function () {
    it('updates an arbitrary preferences domain', async function () {
      assert.strictEqual(await sim.updateSettings('com.apple.Accessibility', {ReduceMotionEnabled: 0}), true);
    });

    it('toggles reduce motion and reduce transparency', async function () {
      assert.strictEqual(await sim.setReduceMotion(true), true);
      assert.strictEqual(await sim.setReduceMotion(false), true);
      assert.strictEqual(await sim.setReduceTransparency(true), true);
      assert.strictEqual(await sim.setReduceTransparency(false), true);
    });

    it('toggles AutoFill Passwords', async function () {
      assert.strictEqual(await sim.setAutoFillPasswords(true), true);
      assert.strictEqual(await sim.setAutoFillPasswords(false), true);
    });

    it('disables the keyboard introduction', async function () {
      assert.strictEqual(await sim.disableKeyboardIntroduction(), true);
    });

    it('configures locale, keyboard, and language', async function () {
      assert.strictEqual(
        await sim.configureLocalization({
          locale: {name: 'en_US', calendar: 'gregorian'},
          keyboard: {name: 'en_US', layout: 'QWERTY'},
        }),
        true,
      );
      assert.strictEqual(
        await sim.configureLocalization({
          language: {name: 'en', skipSyncUiDialogTranslation: true},
        }),
        true,
      );
    });
  });

  describe('misc', function () {
    it('performs a shake gesture', async function () {
      await assert.doesNotReject(sim.shake());
    });
  });

  describe('UI client (terminal)', function () {
    it('kills the UI client', async function () {
      assert.strictEqual(await sim.killUIClient(), true);
      // Confirms the kill signal was sent, not that the GUI app has fully torn down yet.
      await waitForCondition(async () => !(await sim.isUIClientRunning()), {
        waitMs: ciScale(30000),
        intervalMs: 500,
        error: 'expected the UI client to eventually stop running',
      });
    });
  });

  describe('lifecycle (terminal)', function () {
    it('shuts down, erases, and becomes fresh again', async function () {
      await sim.shutdown({timeout: LONG_TIMEOUT});
      assert.strictEqual(await sim.isShutdown(), true);

      await sim.clean();
      assert.strictEqual(await sim.isFresh(), true);
    });
  });
});

/**
 * Own device, booted headless: the device pasteboard never reflects a write while a UI client is
 * attached (confirmed with the plain `xcrun simctl pbcopy`/`pbpaste` CLI too — a platform limit).
 */
describe('pasteboard', function () {
  let udid: string;
  let sim: Simulator;

  before(async function () {
    udid = await createTestDevice('appium-ios-simulator-pasteboard-test', DEVICE_NAME, OS_VERSION);
    sim = await getSimulator(udid);
    await sim.boot();
    await sim.waitForBoot(LONG_TIMEOUT);
  });

  after(async function () {
    await sim.shutdown({timeout: LONG_TIMEOUT});
    await deleteTestDevice(udid);
  });

  it('sets and gets the device pasteboard', async function () {
    const expected = `appium-ios-simulator-test-${Date.now()}`;
    await sim.setPasteboard(expected);
    let actual = '';
    await waitForCondition(
      async () => {
        actual = await sim.getPasteboard();
        return actual === expected;
      },
      {waitMs: ciScale(10000), intervalMs: 500, error: `expected the pasteboard to eventually read '${expected}'`},
    );
    assert.strictEqual(actual, expected);
  });
});

/**
 * `devicesSetPath` needs its own device set entirely, so it can't share the suite above's device.
 */
describe('devicesSetPath', function () {
  let customSetPath: string;
  let udid: string;

  before(async function () {
    customSetPath = await fs.mkdtemp(path.join(os.tmpdir(), 'appium-ios-simulator-test-deviceset-'));
    udid = await createTestDevice('appium-ios-simulator-deviceset-test', DEVICE_NAME, OS_VERSION, customSetPath);
  });

  after(async function () {
    await deleteTestDevice(udid, customSetPath);
    await fs.rm(customSetPath, {recursive: true, force: true});
  });

  it('is invisible to the default device set', async function () {
    await assert.rejects(getSimulator(udid), /No sim found/);
  });

  it('is found once devicesSetPath points at its device set, and stat() confirms the same device', async function () {
    const sim = await getSimulator(udid, {devicesSetPath: customSetPath});
    assert.strictEqual(sim.devicesSetPath, customSetPath);
    assert.strictEqual((await sim.stat()).udid, udid);
  });

  it('grants a permission via the xcrun simctl privacy carve-out on a booted custom-set device', async function () {
    // Regression test: `simctl privacy` must be told `--set <customSetPath>`, or it looks for the
    // device in the default set and fails, since `location` isn't a plain TCC row (see permissions.ts).
    const sim = await getSimulator(udid, {devicesSetPath: customSetPath});
    await sim.run({startupTimeout: LONG_TIMEOUT});
    try {
      await assert.doesNotReject(sim.setPermission('com.appium.ios-simulator.doesnotexist', 'location', 'yes'));
    } finally {
      await sim.shutdown();
    }
  });
});

/**
 * Genuinely needs two devices booted simultaneously — can't share the main suite's single device.
 */
describe('multiple simulator instances', function () {
  const DEVICES_COUNT = 2;
  let udids: string[] = [];
  let sims: Simulator[] = [];

  before(async function () {
    await killAllSimulators();
    for (let i = 0; i < DEVICES_COUNT; i++) {
      const udid = await createTestDevice(`appium-ios-simulator-multi-test-${i}`, DEVICE_NAME, OS_VERSION);
      udids.push(udid);
      sims.push(await getSimulator(udid));
    }
  });

  after(async function () {
    await killAllSimulators();
    await Promise.all(udids.map((udid) => deleteTestDevice(udid)));
    udids = [];
    sims = [];
  });

  it('boots and shuts down multiple simulators independently', async function () {
    await Promise.all(sims.map((sim) => sim.run({startupTimeout: LONG_TIMEOUT})));
    await retryInterval(30, 1000, async function () {
      for (const sim of sims) {
        assert.strictEqual(await sim.isRunning(), true);
      }
    });

    await Promise.all(sims.map((sim) => sim.shutdown({timeout: LONG_TIMEOUT})));
    for (const sim of sims) {
      assert.strictEqual(await sim.isRunning(), false);
    }
  });
});

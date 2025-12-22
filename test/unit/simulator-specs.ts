import { getSimulator } from '../../lib/simulator';
import * as teenProcess from 'teen_process';
import * as utils from '../../lib/utils';
import sinon from 'sinon';
import { devices } from './device-list';
import B from 'bluebird';
import { SimulatorXcode14 } from '../../lib/simulator-xcode-14';
import { SimulatorXcode15 } from '../../lib/simulator-xcode-15';
import { use as chaiUse, expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import * as xcodeModule from 'appium-xcode';

chaiUse(chaiAsPromised);

const UDID = devices['10.0'][0].udid;

describe('simulator', function () {
  let sandbox: sinon.SinonSandbox;

  let assertXcodeVersionStub: sinon.SinonStub;
  let getDevicesStub: sinon.SinonStub;
  let getVersionStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    assertXcodeVersionStub = sandbox.stub(utils, 'assertXcodeVersion');
    getDevicesStub = sandbox.stub(utils, 'getDevices');
    getDevicesStub.resolves(devices);
    getVersionStub = sandbox.stub(xcodeModule, 'getVersion');
    getVersionStub.withArgs(true).returns(B.resolve({major: 14, versionString: '14.0.0'}));
  });
  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe('getSimulator', function () {
    it('should create a simulator with default xcode version', async function () {
      const xcodeVersion = {major: 14, versionString: '14.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const sim = await getSimulator(UDID);
      expect(sim.xcodeVersion).to.equal(xcodeVersion);
      expect(sim.constructor.name).to.eql(SimulatorXcode14.name);
    });

    const xcodeVersions: Array<[number, number, string, typeof SimulatorXcode14 | typeof SimulatorXcode15]> = [
      [14, 0, '14.0.0', SimulatorXcode14],
      [15, 0, '15.0.0', SimulatorXcode15],
    ];

    for (const [major, minor, versionString, expectedXcodeClass] of xcodeVersions) {
      it(`should create an xcode ${major} simulator with xcode version ${versionString}`, async function () {
        const xcodeVersion = {major, minor, versionString};
        assertXcodeVersionStub.callsFake(() => xcodeVersion);
        const sim = await getSimulator(UDID);
        expect(sim.xcodeVersion).to.equal(xcodeVersion);
        expect(sim.constructor.name).to.eql(expectedXcodeClass.name);
      });
    }

    it('should throw an error if xcode version is below minimum supported', async function () {
      const xcodeVersion = {major: 10, versionString: '10.0.0'};
      assertXcodeVersionStub.callsFake(() => {
        throw new Error(
          `Tried to use an iOS simulator with xcode version ${xcodeVersion.versionString} ` +
          `but only Xcode version 14 and up are supported`
        );
      });
      await expect(getSimulator(UDID)).to.eventually.be.rejected;
    });

    it('should throw an error if xcode version does not match', async function () {
      assertXcodeVersionStub.throws();
      await expect(getSimulator(UDID)).to.eventually.be.rejected;
    });

    it('should throw an error if udid does not exist', async function () {
      await expect(getSimulator('123')).to.be.rejectedWith('No sim found');
    });

    it('should list stats for sim', async function () {
      const xcodeVersion = {major: 14, versionString: '14.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);

      const sims = (await B.all([
        'F33783B2-9EE9-4A99-866E-E126ADBAD410',
        'DFBC2970-9455-4FD9-BB62-9E4AE5AA6954',
      ].map((udid) => getSimulator(udid)))).map((sim) => {
        sinon.stub(sim.simctl, 'getDevices').returns(B.resolve(devices));
        return sim;
      });

      const stats = await B.all(sims.map((sim) => sim.stat()));
      expect(stats[0].state).to.equal('Shutdown');
      expect(stats[0].name).to.equal('Resizable iPhone');
      expect(stats[1].state).to.equal('Shutdown');
      expect(stats[1].name).to.equal('Resizable iPad');
    });
  });

  describe('getWebInspectorSocket', function () {
    let innerExecStub;
    const stdout = `COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
launchd_s 81243 mwakizaka    3u  unix 0x9461828ef425ac31      0t0      /private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket
launchd_s 81243 mwakizaka    4u  unix 0x9461828ef425bc99      0t0      /tmp/com.apple.CoreSimulator.SimDevice.0829568F-7479-4ADE-9E51-B208DC99C107/syslogsock
launchd_s 81243 mwakizaka    6u  unix 0x9461828ef27d4c39      0t0      ->0x9461828ef27d4b71
launchd_s 81243 mwakizaka    7u  unix 0x9461828ef27d4c39      0t0      ->0x9461828ef27d5021
launchd_s 81243 mwakizaka    8u  unix 0x9461828ef425b4c9      0t0      /private/tmp/com.apple.launchd.88z8qTMoJA/Listeners
launchd_s 81243 mwakizaka    9u  unix 0x9461828ef425be29      0t0      /private/tmp/com.apple.launchd.rbqFyGyXrT/com.apple.testmanagerd.unix-domain.socket
launchd_s 81243 mwakizaka   10u  unix 0x9461828ef425b4c9      0t0      /private/tmp/com.apple.launchd.88z8qTMoJA/Listeners
launchd_s 81243 mwakizaka   11u  unix 0x9461828ef425c081      0t0      /private/tmp/com.apple.launchd.zHidszZQUZ/com.apple.testmanagerd.remote-automation.unix-domain.socket
launchd_s 81243 mwakizaka   12u  unix 0x9461828ef425def9      0t0      ->0x9461828ef425de31
launchd_s 35621 mwakizaka    4u  unix 0x7b7dbedd6d63253f      0t0      /tmp/com.apple.CoreSimulator.SimDevice.B5048708-566E-45D5-9885-C878EF7D6D13/syslogsock
launchd_s 35621 mwakizaka    5u  unix 0x7b7dbedd6d62f727      0t0      /private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket
launchd_s 35621 mwakizaka    9u  unix 0x7b7dbedd6d632607      0t0      /private/tmp/com.apple.launchd.KbYwOrA36E/Listeners
launchd_s 35621 mwakizaka   10u  unix 0x7b7dbedd6d62f727      0t0      /private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket
launchd_s 35621 mwakizaka   11u  unix 0x7b7dbedd6d62e6bf      0t0      /private/tmp/com.apple.launchd.7wTVfXC9QX/com.apple.testmanagerd.unix-domain.socket
launchd_s 35621 mwakizaka   12u  unix 0x7b7dbedd6d632607      0t0      /private/tmp/com.apple.launchd.KbYwOrA36E/Listeners
launchd_s 35621 mwakizaka   13u  unix 0x7b7dbedd6d62e84f      0t0      /private/tmp/com.apple.launchd.g7KQlSsvXT/com.apple.testmanagerd.remote-automation.unix-domain.socket
launchd_s 35621 mwakizaka   15u  unix 0x7b7dbedd6d62e6bf      0t0      /private/tmp/com.apple.launchd.7wTVfXC9QX/com.apple.testmanagerd.unix-domain.socket
launchd_s 35621 mwakizaka   16u  unix 0x7b7dbedd6d62e84f      0t0      /private/tmp/com.apple.launchd.g7KQlSsvXT/com.apple.testmanagerd.remote-automation.unix-domain.socket`;

    beforeEach(function () {
      innerExecStub = sandbox.stub().callsFake(() => ({ stdout } as any));
      sandbox.stub(teenProcess, 'exec').get(() => innerExecStub);
      const xcodeVersion = {major: 14, versionString: '14.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);
    });

    const testParams = [
      {udid: '0829568F-7479-4ADE-9E51-B208DC99C107', line: 'first', expected: '/private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket'},
      {udid: 'B5048708-566E-45D5-9885-C878EF7D6D13', line: 'second', expected: '/private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket'},
    ];

    testParams.forEach(({udid, line, expected}) => {
      it(`should find a Web Inspector socket when it appears at the ${line} line of grouped records`, async function () {
        const sim = await getSimulator(udid);
        const webInspectorSocket = await sim.getWebInspectorSocket();
        expect(webInspectorSocket).to.equal(expected);
      });
    });

    it(`should assign webInspectorSocket value only once`, async function () {
      const sim = await getSimulator(testParams[0].udid);
      await sim.getWebInspectorSocket();
      await sim.getWebInspectorSocket();
      expect(innerExecStub.callCount).to.equal(1);
    });
  });

  describe('configureLocalization', function () {
    let sim: any;
    let spawnProcessSpy: sinon.SinonStub;
    beforeEach(async function () {
      const xcodeVersion = {major: 14, versionString: '14.0.0'};
      assertXcodeVersionStub.callsFake(() => xcodeVersion);
      sim = await getSimulator(UDID);
      spawnProcessSpy = sinon.stub(sim.simctl, 'spawnProcess');
    });
    afterEach(function () {
      if (spawnProcessSpy) {
        spawnProcessSpy.reset();
      }
    });

    describe('locale', function () {
      it('should configure locale', async function () {
        const options = {locale: {name: 'en_US', calendar: 'gregorian'}};
        expect(await sim.configureLocalization(options)).to.be.true;
        expect(spawnProcessSpy.firstCall.args[0]).to.eql(
          ['defaults', 'write', '.GlobalPreferences.plist', 'AppleLocale', '<string>en_US@calendar=gregorian</string>']
        );
        expect(spawnProcessSpy.callCount).to.eql(1);
      });
    });

    describe('keyboard', function () {
      it('should configure keyboard', async function () {
        const options = {keyboard: {name: 'en_US', layout: 'QWERTY'}};
        expect(await sim.configureLocalization(options)).to.be.true;
        expect(spawnProcessSpy.firstCall.args[0]).to.eql(
          ['defaults', 'write', '.GlobalPreferences.plist', 'AppleKeyboards', '<array><string>en_US@sw=QWERTY</string></array>']
        );
        expect(spawnProcessSpy.secondCall.args[0]).to.eql(
          ['defaults', 'write', 'com.apple.Preferences', 'KeyboardsCurrentAndNext', '<array><string>en_US@sw=QWERTY</string></array>']
        );
        expect(spawnProcessSpy.thirdCall.args[0]).to.eql(
          ['defaults', 'write', 'com.apple.Preferences', 'KeyboardLastUsed', '<string>en_US@sw=QWERTY</string>']
        );
        expect(spawnProcessSpy.getCall(3).args[0]).to.eql(
          ['defaults', 'write', 'com.apple.Preferences', 'KeyboardLastUsedForLanguage', '<dict><key>en_US</key><string>en_US@sw=QWERTY</string></dict>']
        );
        expect(spawnProcessSpy.callCount).to.eql(4);
      });
    });

    describe('language', function () {
      const stdout = JSON.stringify({AppleLanguages: ['en']});
      beforeEach(function () {
        sandbox.stub(teenProcess, 'exec').get(() => sandbox.stub().callsFake(() => ({ stdout } as any)));
        sandbox.stub(sim, 'getDir').callsFake(() => (''));
      });

      it('should configure language and restart services', async function () {
        const options = {language: {name: 'ja'}};
        expect(await sim.configureLocalization(options)).to.be.true;
        expect(spawnProcessSpy.firstCall.args[0]).to.eql(
          ['defaults', 'write', '.GlobalPreferences.plist', 'AppleLanguages', '<array><string>ja</string></array>']
        );
        expect(spawnProcessSpy.secondCall.args[0]).to.eql(
          ['launchctl', 'stop', 'com.apple.SpringBoard']
        );
        expect(spawnProcessSpy.thirdCall.args[0]).to.eql(
          ['launchctl', 'stop', 'com.apple.locationd']
        );
        expect(spawnProcessSpy.getCall(3).args[0]).to.eql(
          ['launchctl', 'stop', 'com.apple.tccd']
        );
        expect(spawnProcessSpy.getCall(4).args[0]).to.eql(
          ['launchctl', 'stop', 'com.apple.akd']
        );
        expect(spawnProcessSpy.callCount).to.eql(5);
      });

      it('should confirm skip restarting services if already applied', async function () {
        const options = {language: {name: 'en'}};
        expect(await sim.configureLocalization(options)).to.be.true;
        expect(spawnProcessSpy.firstCall.args[0]).to.eql(
          ['defaults', 'write', '.GlobalPreferences.plist', 'AppleLanguages', '<array><string>en</string></array>']
        );
        expect(spawnProcessSpy.callCount).to.eql(1);
      });

      it('should confirm skip restarting services if skipSyncUiDialogTranslation is true', async function () {
        const options = {language: {name: 'ja', skipSyncUiDialogTranslation: true}};
        expect(await sim.configureLocalization(options)).to.be.true;
        expect(spawnProcessSpy.firstCall.args[0]).to.eql(
          ['defaults', 'write', '.GlobalPreferences.plist', 'AppleLanguages', '<array><string>ja</string></array>']
        );
        expect(spawnProcessSpy.callCount).to.eql(1);
      });
    });
  });
});


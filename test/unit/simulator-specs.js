// transpile:mocha

import { getSimulator } from '../../lib/simulator';
import * as teenProcess from 'teen_process';
import Simctl from 'node-simctl';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { devices } from '../assets/deviceList';
import B from 'bluebird';
import xcode from 'appium-xcode';
import SimulatorXcode8 from '../../lib/simulator-xcode-8';
import SimulatorXcode9 from '../../lib/simulator-xcode-9';
import SimulatorXcode93 from '../../lib/simulator-xcode-9.3';
import SimulatorXcode10 from '../../lib/simulator-xcode-10';
import SimulatorXcode11 from '../../lib/simulator-xcode-11';
import SimulatorXcode11_4 from '../../lib/simulator-xcode-11.4';


chai.should();
chai.use(chaiAsPromised);

const UDID = devices['8.1'][0].udid;

describe('simulator', function () {
  let xcodeMock;
  let getDevicesStub;

  beforeEach(function () {
    xcodeMock = sinon.mock(xcode);
    getDevicesStub = sinon.stub(Simctl.prototype, 'getDevices');
    getDevicesStub.returns(B.resolve(devices));
  });
  afterEach(function () {
    xcodeMock.restore();
    Simctl.prototype.getDevices.restore();
  });

  describe('getSimulator', function () {
    it('should create a simulator with default xcode version', async function () {
      let xcodeVersion = {major: 8, versionString: '8.0.0'};
      xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));

      let sim = await getSimulator(UDID);
      sim.xcodeVersion.should.equal(xcodeVersion);
      sim.constructor.name.should.be.eql(SimulatorXcode8.name);
    });

    const xcodeVersions = [
      [8, 0, '8.0.0', SimulatorXcode8],
      [9, 0, '9.0.0', SimulatorXcode9],
      [9, 3, '9.3.0', SimulatorXcode93],
      [10, 0, '10.0.0', SimulatorXcode10],
      [11, 0, '11.0.0', SimulatorXcode11],
      [11, 4, '11.4.0', SimulatorXcode11_4],
    ];

    for (const [major, minor, versionString, expectedXcodeClass] of xcodeVersions) {
      it(`should create an xcode ${major} simulator with xcode version ${versionString}`, async function () {
        let xcodeVersion = {major, minor, versionString};
        xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));
        let sim = await getSimulator(UDID);
        sim.xcodeVersion.should.equal(xcodeVersion);
        sim.constructor.name.should.be.eql(expectedXcodeClass.name);
      });
    }

    it('should throw an error if xcode version less than 6', async function () {
      let xcodeVersion = {major: 5, versionString: '5.4.0'};
      xcodeMock.expects('getVersion').returns(B.resolve(xcodeVersion));
      await getSimulator(UDID).should.eventually.be.rejectedWith('version');
    });

    it('should throw an error if udid does not exist', async function () {
      await getSimulator('123').should.be.rejectedWith('No sim found');
    });

    it('should list stats for sim', async function () {
      let xcodeVersion = {major: 8, versionString: '8.0.0'};
      xcodeMock.expects('getVersion').atLeast(1).returns(B.resolve(xcodeVersion));

      let sims = [
        getSimulator('F33783B2-9EE9-4A99-866E-E126ADBAD410'),
        getSimulator('DFBC2970-9455-4FD9-BB62-9E4AE5AA6954'),
      ];

      let stats = sims.map(function (simProm) {
        // eslint-disable-next-line promise/prefer-await-to-then
        return simProm.then((sim) => sim.stat());
      });

      stats = await B.all(stats);

      stats[0].state.should.equal('Shutdown');
      stats[0].name.should.equal('Resizable iPhone');
      stats[1].state.should.equal('Shutdown');
      stats[1].name.should.equal('Resizable iPad');
    });
  });

  describe('getWebInspectorSocket', function () {
    const stdout = `COMMAND     PID      USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
launchd_s 81243 mwakizaka    3u  unix 0x9461828ef425ac31      0t0      /private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket
launchd_s 81243 mwakizaka    4u  unix 0x9461828ef425bc99      0t0      /tmp/com.apple.CoreSimulator.SimDevice.0829568F-7479-4ADE-9E51-B208DC99C107/syslogsock
launchd_s 81243 mwakizaka    6u  unix 0x9461828ef27d4c39      0t0      ->0x9461828ef27d4b71
launchd_s 81243 mwakizaka    7u  unix 0x9461828ef425dd69      0t0      ->0x9461828ef27d5021
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
      sinon.stub(teenProcess, 'exec').callsFake(() => ({ stdout }));
    });
    afterEach(function () {
      teenProcess.exec.restore();
    });

    const testParams = [
      {udid: '0829568F-7479-4ADE-9E51-B208DC99C107', line: 'first', expected: '/private/tmp/com.apple.launchd.ULf9wKNtd5/com.apple.webinspectord_sim.socket'},
      {udid: 'B5048708-566E-45D5-9885-C878EF7D6D13', line: 'second', expected: '/private/tmp/com.apple.launchd.zuM1XDJcwr/com.apple.webinspectord_sim.socket'},
    ];

    testParams.forEach(({udid, line, expected}) => {
      it(`should find a Web Inspector socket when it appears at the ${line} line of grouped records`, async function () {
        const xcodeVersion = {major: 9, versionString: '9.3.0'};
        xcodeMock.expects('getVersion').atLeast(1).returns(B.resolve(xcodeVersion));

        const sim = await getSimulator(udid);
        const webInspectorSocket = await sim.getWebInspectorSocket();
        webInspectorSocket.should.equal(expected);
      });
    });

    it(`should assign webInspectorSocket value only once`, async function () {
      const xcodeVersion = {major: 9, versionString: '9.3.0'};
      xcodeMock.expects('getVersion').atLeast(1).returns(B.resolve(xcodeVersion));

      const sim = await getSimulator(testParams[0].udid);
      await sim.getWebInspectorSocket();
      await sim.getWebInspectorSocket();
      teenProcess.exec.callCount.should.equal(1);
    });
  });
});

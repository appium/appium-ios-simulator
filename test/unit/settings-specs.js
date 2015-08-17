// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import 'mochawait';
import B from 'bluebird';
import { update, read, updateLocationSettings, updateLocale } from '../../lib/settings.js';
import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import path from 'path';
import { tempDir, fs } from 'appium-support';
import ncp from 'ncp';
import sinon from 'sinon';

let copy = B.promisify(ncp.ncp);

const plist = path.resolve('test/assets/sample.plist');
const SIM_DIRECTORY = path.resolve('test/assets/');
// plist asset looks like this:
// [ { 'com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework':
//      { Whitelisted: false,
//        Executable: '',
//        BundlePath: '/System/Library/PrivateFrameworks/Parsec.framework',
//        Registered: '' },
//     'com.apple.locationd.bundle-/System/Library/PrivateFrameworks/WirelessDiagnostics.framework':
//      { Whitelisted: false,
//        Executable: '',
//        BundlePath: '/System/Library/PrivateFrameworks/WirelessDiagnostics.framework',
//        Registered: '' } } ]


chai.should();
let expect = chai.expect;
chai.use(chaiAsPromised);

describe('settings', () => {
  describe('general plist handling', () => {
    let tmpPlist;

    beforeEach(async () => {
      let temp = await tempDir.path();
      tmpPlist = path.resolve(temp, 'sample.plist');
      await copy(plist, tmpPlist);
    });

    afterEach(async () => {
      // get rid of the temporary plist we made
      await fs.unlink(tmpPlist);
    });

    it('should update a plist', async () => {
      let originalData = await read(tmpPlist);
      originalData['com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework']
        .Whitelisted = true;
      await update(tmpPlist, originalData);
      let updatedData = await read(tmpPlist);

      updatedData['com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework']
        .Whitelisted.should.be.true;

      originalData.should.eql(updatedData);
    });

    it('should read a plist', async () => {
      let data = await read(tmpPlist);
      data['com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework']
        .should.be.an.instanceof(Object);
    });
  });

  describe('location services', () => {
    let realClientFile;
    let realCacheFiles;
    let sim;
    beforeEach(async () => {
      // make a copy of the clients plist
      let temp = path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'clients-fixture.plist');
      realClientFile = path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'clients.plist');
      await copy(temp, realClientFile);

      // and the cache plists
      realCacheFiles = [];
      temp = path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'cache-fixture.plist');
      realCacheFiles.push(path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'cache.plist'));
      await copy(temp, realCacheFiles[0]);
      temp = path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', 'com.apple.locationd-fixture.plist');
      realCacheFiles.push(path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', 'com.apple.locationd.plist'));
      await copy(temp, realCacheFiles[1]);

      // create a stub for getting the simulator dir
      sim = new SimulatorXcode6();
      sinon.stub(sim, 'getDir').returns(SIM_DIRECTORY);
    });
    afterEach(async () => {
      // get rid of the temporary plist we made
      await fs.unlink(realClientFile);
      for (let file of realCacheFiles) {
        await fs.unlink(file);
      }
    });

    describe('client plist', () => {
      let data;
      let weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
                        'PrivateFrameworks/AOSNotification.framework';
      beforeEach(async () => {
        data = await read(realClientFile);
        expect(data['com.apple.mobilesafari']).to.not.exist;
        expect(data[weirdLocKey]).to.not.exist;
      });

      it('should update', async () => {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        let finalData = await read(realClientFile);
        finalData.should.not.eql(data);
        finalData['com.apple.mobilesafari'].should.exist;
        finalData['com.apple.mobilesafari'].Authorized.should.be.true;
      });

      it('should update an already existing bundle without changing anything but Authorized', async () => {
        await updateLocationSettings(sim, 'io.appium.test', true);

        let finalData = await read(realClientFile);
        finalData.should.not.eql(data);

        let originalRecord = data['io.appium.test'];
        let updatedRecord = finalData['io.appium.test'];
        updatedRecord.Whitelisted.should.equal(originalRecord.Whitelisted);
        updatedRecord.Executable.should.equal(originalRecord.Executable);
        updatedRecord.Registered.should.equal(originalRecord.Registered);
        updatedRecord.Authorized.should.not.equal(originalRecord.Authorized);
      });

      it('should update with weird location key', async () => {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        let finalData = await read(realClientFile);
        finalData.should.not.eql(data);
        finalData[weirdLocKey].should.exist;
      });
    });

    describe('cache plists', () => {
      it('should update both files', async () => {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        for (let file of realCacheFiles) {
          let finalData = await read(file);
          finalData['com.apple.mobilesafari'].should.exist;
          finalData['com.apple.mobilesafari'].LastFenceActivityTimestamp.should.equal(412122103.232983);
          finalData['com.apple.mobilesafari'].CleanShutdown.should.be.true;
        }
      });
    });
  });

  describe('updateLocale', () => {
    let realPlistFile;
    let sim;
    beforeEach(async () => {
      let temp = path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', '.GlobalPreferences-fixture.plist');
      realPlistFile = path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', '.GlobalPreferences.plist');
      await copy(temp, realPlistFile);

      // create a stub for getting the simulator dir
      sim = new SimulatorXcode6();
      sinon.stub(sim, 'getDir').returns(SIM_DIRECTORY);
    });
    afterEach(async () => {
      // get rid of the temporary plist we made
      await fs.unlink(realPlistFile);
    });

    it('should update language', async () => {
      let originalData = await read(realPlistFile);

      await updateLocale(sim, 'rr');
      let finalData = await read(realPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.include('rr');
    });

    it('should not do anything when language is already present', async () => {
      let originalData = await read(realPlistFile);

      await updateLocale(sim, 'en');
      (await read(realPlistFile)).should.eql(originalData);
    });

    it('should update locale', async () => {
      let originalData = await read(realPlistFile);

      await updateLocale(sim, undefined, 'fr_US');
      let finalData = await read(realPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.include('fr_US');
    });

    it('should update calendarFormat', async () => {
      let originalData = await read(realPlistFile);

      await updateLocale(sim, undefined, undefined, 'something');
      let finalData = await read(realPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.include('@calendar=something');
    });

    it('should preserve the calendarFormat when updating locale alone', async () => {
      let originalData = await read(realPlistFile);

      // get a calendar format into the plist
      await updateLocale(sim, undefined, undefined, 'something');
      let intermediateData = await read(realPlistFile);
      intermediateData.should.not.eql(originalData);
      intermediateData.AppleLanguages.should.eql(originalData.AppleLanguages);
      intermediateData.AppleLocale.should.include('@calendar=something');

      // udpate with a new locale
      await updateLocale(sim, undefined, 'fr_US');
      let finalData = await read(realPlistFile);
      finalData.should.not.eql(intermediateData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.eql('fr_US@calendar=something');
    });
  });
});

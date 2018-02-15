// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { update, read, updateLocationSettings, updateLocale,
         updateSafariUserSettings } from '../../lib/settings';
import SimulatorXcode6 from '../../lib/simulator-xcode-6';
import path from 'path';
import { tempDir, fs } from 'appium-support';
import sinon from 'sinon';
import { asyncmap } from 'asyncbox';


const SIM_DIRECTORY = path.resolve('test/assets/');

chai.should();
let expect = chai.expect;
chai.use(chaiAsPromised);

describe('settings', function () {
  let sim;
  before(function () {
    // create a simulator object that returns our fixture directory
    sim = new SimulatorXcode6();
    sim.xcodeVersion = {
      versionString: '6.1',
      versionFloat: 6.1,
      major: 6,
      minor: 1,
      patch: undefined
    };
    sinon.stub(sim, 'getDir').returns(SIM_DIRECTORY);
  });

  describe('general plist handling', function () {
    const plist = path.resolve('test/assets/sample.plist');
    const expectedField = 'com.apple.locationd.bundle-/System/Library/PrivateFrameworks/Parsec.framework';
    let tmpPlist;

    beforeEach(async function () {
      let temp = await tempDir.path();
      tmpPlist = path.resolve(temp, 'sample.plist');
      await fs.copyFile(plist, tmpPlist);
    });

    afterEach(async function () {
      // get rid of the temporary plist we made
      await fs.unlink(tmpPlist);
    });

    it('should update a plist', async function () {
      let originalData = await read(tmpPlist);
      originalData[expectedField]
        .Whitelisted = true;
      await update(tmpPlist, originalData);
      let updatedData = await read(tmpPlist);

      updatedData[expectedField]
        .Whitelisted.should.be.true;

      originalData.should.eql(updatedData);
    });

    it('should read a plist', async function () {
      let data = await read(tmpPlist);
      data[expectedField]
        .should.be.an.instanceof(Object);
    });
  });

  describe('location services', function () {
    const clientFixtureFile = path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'clients-fixture.plist');
    const clientFile = path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'clients.plist');
    const cacheFixtureFiles = [
      path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'cache-fixture.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', 'com.apple.locationd-fixture.plist')
    ];
    const cacheFiles = [
      path.resolve(SIM_DIRECTORY, 'Library', 'Caches', 'locationd', 'cache.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', 'com.apple.locationd.plist')
    ];
    beforeEach(async function () {
      // make a copy of the clients plist
      await fs.copyFile(clientFixtureFile, clientFile);

      // and the cache plists
      for (let i = 0; i < cacheFiles.length; i++) {
        await fs.copyFile(cacheFixtureFiles[i], cacheFiles[i]);
      }
    });
    afterEach(async function () {
      // get rid of the temporary plist we made
      await fs.unlink(clientFile);
      for (let file of cacheFiles) {
        await fs.unlink(file);
      }
    });

    describe('client plist', function () {
      let data;
      const weirdLocKey = 'com.apple.locationd.bundle-/System/Library/' +
                          'PrivateFrameworks/AOSNotification.framework';
      beforeEach(async function () {
        data = await read(clientFile);
        expect(data['com.apple.mobilesafari']).to.not.exist;
        expect(data[weirdLocKey]).to.not.exist;
      });

      it('should update', async function () {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        let finalData = await read(clientFile);
        finalData.should.not.eql(data);
        finalData['com.apple.mobilesafari'].should.exist;
        finalData['com.apple.mobilesafari'].Authorized.should.be.true;
      });

      it('should update an already existing bundle without changing anything but Authorized', async function () {
        await updateLocationSettings(sim, 'io.appium.test', true);

        let finalData = await read(clientFile);
        finalData.should.not.eql(data);

        let originalRecord = data['io.appium.test'];
        let updatedRecord = finalData['io.appium.test'];
        updatedRecord.Whitelisted.should.equal(originalRecord.Whitelisted);
        updatedRecord.Executable.should.equal(originalRecord.Executable);
        updatedRecord.Registered.should.equal(originalRecord.Registered);
        updatedRecord.Authorized.should.not.equal(originalRecord.Authorized);
      });

      it('should update with weird location key', async function () {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        let finalData = await read(clientFile);
        finalData.should.not.eql(data);
        finalData[weirdLocKey].should.exist;
      });
    });

    describe('cache plists', function () {
      it('should update both files', async function () {
        await updateLocationSettings(sim, 'com.apple.mobilesafari', true);

        for (let file of cacheFiles) {
          let finalData = await read(file);
          finalData['com.apple.mobilesafari'].should.exist;
          finalData['com.apple.mobilesafari'].LastFenceActivityTimestamp.should.equal(412122103.232983);
          finalData['com.apple.mobilesafari'].CleanShutdown.should.be.true;
        }
      });
    });
  });

  describe('updateLocale', function () {
    const globalPlistFixtureFile = path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', '.GlobalPreferences-fixture.plist');
    const globalPlistFile = path.resolve(SIM_DIRECTORY, 'Library', 'Preferences', '.GlobalPreferences.plist');

    beforeEach(async function () {
      await fs.copyFile(globalPlistFixtureFile, globalPlistFile);
    });
    afterEach(async function () {
      // get rid of the temporary plist we made
      await fs.unlink(globalPlistFile);
    });

    it('should update language', async function () {
      let originalData = await read(globalPlistFile);

      await updateLocale(sim, 'rr');
      let finalData = await read(globalPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.include('rr');
    });

    it('should not do anything when language is already present', async function () {
      let originalData = await read(globalPlistFile);

      await updateLocale(sim, 'en');
      (await read(globalPlistFile)).should.eql(originalData);
    });

    it('should update locale', async function () {
      let originalData = await read(globalPlistFile);

      await updateLocale(sim, undefined, 'fr_US');
      let finalData = await read(globalPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.include('fr_US');
    });

    it('should update calendarFormat', async function () {
      let originalData = await read(globalPlistFile);

      await updateLocale(sim, undefined, undefined, 'something');
      let finalData = await read(globalPlistFile);
      finalData.should.not.eql(originalData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.include('@calendar=something');
    });

    it('should preserve the calendarFormat when updating locale alone', async function () {
      let originalData = await read(globalPlistFile);

      // get a calendar format into the plist
      await updateLocale(sim, undefined, undefined, 'something');
      let intermediateData = await read(globalPlistFile);
      intermediateData.should.not.eql(originalData);
      intermediateData.AppleLanguages.should.eql(originalData.AppleLanguages);
      intermediateData.AppleLocale.should.include('@calendar=something');

      // udpate with a new locale
      await updateLocale(sim, undefined, 'fr_US');
      let finalData = await read(globalPlistFile);
      finalData.should.not.eql(intermediateData);
      finalData.AppleLanguages.should.eql(originalData.AppleLanguages);
      finalData.AppleLocale.should.eql('fr_US@calendar=something');
    });
  });

  describe('updateSafariUserSettings', function () {
    const fixtureFiles = [
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'EffectiveUserSettings-fixture.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'UserSettings-fixture.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings-fixture.plist')
    ];
    const realFiles = [
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'EffectiveUserSettings.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'UserSettings.plist'),
      path.resolve(SIM_DIRECTORY, 'Library', 'ConfigurationProfiles', 'PublicInfo', 'PublicEffectiveUserSettings.plist')
    ];

    beforeEach(async function () {
      // make a copy of the fixture
      for (let i = 0; i < fixtureFiles.length; i++) {
        await fs.copyFile(fixtureFiles[i], realFiles[i]);
      }
    });
    afterEach(async function () {
      // get rid of the temporary plists we made
      for (let file of realFiles) {
        await fs.unlink(file);
      }
    });

    async function getData () {
      return asyncmap(realFiles, (file) => {
        return read(file);
      }, true);
    }

    it ('should update all the files', async function () {
      let originalData = await getData();

      let settingSet = {
        WebKitJavaScriptEnabled: false,
        WebKitJavaScriptCanOpenWindowsAutomatically: false,
        WarnAboutFraudulentWebsites: false
      };
      await updateSafariUserSettings(sim, settingSet);

      // check the update
      let finalData = await getData();
      for (let i = 0; i < realFiles.length; i++) {
        finalData[i].should.not.eql(originalData[i]);
        finalData[i].restrictedBool.safariAllowJavaScript.value.should.be.false;
        finalData[i].restrictedBool.safariAllowPopups.value.should.be.false;
        finalData[i].restrictedBool.safariForceFraudWarning.value.should.be.true;
      }
    });
  });
});

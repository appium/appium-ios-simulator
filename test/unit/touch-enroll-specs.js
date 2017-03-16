// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { exec as execNode } from 'child_process';
import B from 'bluebird';
import { getUserDefault, setUserDefault, setTouchEnrollKey, setTouchEnrollKeys, getTouchEnrollKeys, touchEnrollMenuKeys, 
  restoreTouchEnrollShortcuts, NS_USER_KEY_EQUIVALENTS, TOUCH_ENROLL_KEY_CODE } from '../../lib/touch-enroll';

const exec = B.promisify(execNode);

chai.should();
chai.use(chaiAsPromised);

describe('touch-enroll.js', () => {

  describe('getUserDefaults(), setUserDefaults()', () => {
    let domain = 'fakeDomain';

  // Nuke the contents of the domain so it's fresh every test case
    let clearFakeDomain = async function () {
      try {
        await exec(`"defaults" delete "Apple Global Domain" ${domain}`);
      } catch (ign) { }
    };

    beforeEach(async () => {
      await clearFakeDomain();
    });

    afterEach(async () => {
      await clearFakeDomain();
    });

    it('should get undefined for non-existent keys', async () => {
      await getUserDefault(domain, 'hello').should.eventually.be.undefined;
      await getUserDefault(domain, 'foo').should.eventually.be.undefined;
    });

    it('should set defaults', async () => {
      await setUserDefault(domain, 'hello', 'world');
      await getUserDefault(domain, 'hello').should.eventually.equal('world');
    });

    it('should restore default to original value', async () => {
      await setUserDefault(domain, 'hello', '1');
      let originalValue = await getUserDefault(domain, 'hello');
      originalValue.should.equal('1');
      await setUserDefault(domain, 'hello', '2');
      await getUserDefault(domain, 'hello').should.eventually.equal('2');
      await setUserDefault(domain, 'hello', originalValue);
      await getUserDefault(domain, 'hello').should.eventually.equal(originalValue);
    });

    it('should set multiple keys', async () => {
      await setUserDefault(domain, 'hello', 'world');
      await getUserDefault(domain, 'hello').should.eventually.equal('world');
      await setUserDefault(domain, 'foo', 'bar');
      await getUserDefault(domain, 'hello').should.eventually.equal('world');
      await getUserDefault(domain, 'foo').should.eventually.equal('bar');
      await setUserDefault(domain, 'hello', 'whirl');
      await getUserDefault(domain, 'hello').should.eventually.equal('whirl');
      await getUserDefault(domain, 'foo').should.eventually.equal('bar');
    });

    it('should set no value to nil', async () => {
      await setUserDefault(domain, 'hello');
      await getUserDefault(domain, 'hello').should.eventually.equal('nil');
    });

    it('should handle special characters', async () => {
      await setUserDefault(domain, 'hello', TOUCH_ENROLL_KEY_CODE);
      let firstRes = await getUserDefault(domain, 'hello').should.eventually.equal(TOUCH_ENROLL_KEY_CODE);
      await setUserDefault(domain, 'hello', firstRes);
      await getUserDefault(domain, 'hello').should.eventually.equal(firstRes);


      await setUserDefault(domain, 'hello', '\\a');
      firstRes = await getUserDefault(domain, 'hello').should.eventually.equal('\\a');
      await setUserDefault(domain, 'hello', firstRes);
      await getUserDefault(domain, 'hello').should.eventually.equal(firstRes);
    });
  });

  describe('setTouchEnrollKeys, getTouchEnrollKeys, setTouchEnrollKeys', () => {
    beforeEach(async () => {
      for (let key of touchEnrollMenuKeys) {
        await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, undefined);
      }
    });

    it('should set the touch enroll keys', async () => {
      await setTouchEnrollKey();
      for (let key of touchEnrollMenuKeys) {
        await getUserDefault(NS_USER_KEY_EQUIVALENTS, key).should.eventually.equal(TOUCH_ENROLL_KEY_CODE);
      }
    });

    it('should save touch enroll keys', async () => {
      let index = 0;
      for (let key of touchEnrollMenuKeys) {
        await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, index++);
      }
      let keys = await getTouchEnrollKeys();
      keys[0][1].should.equal('0');
      keys[1][1].should.equal('1');
    });

    it('should restore touch enroll keys to their original values', async () => {
      // Set the keys to 0 and 1 and then back them up
      let index = 0;
      for (let key of touchEnrollMenuKeys) {
        await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, index++);
      } 
      let backedUpKeys = await getTouchEnrollKeys();
      backedUpKeys[0][1].should.equal('0');
      backedUpKeys[1][1].should.equal('1');

      // Set the keys to touch enroll shortcuts
      await setTouchEnrollKey();
      let keys = await getTouchEnrollKeys();
      keys[0][1].should.equal(TOUCH_ENROLL_KEY_CODE);
      keys[1][1].should.equal(TOUCH_ENROLL_KEY_CODE);

      // Restore the keys and check that they are the same
      await setTouchEnrollKeys(backedUpKeys);
      let restoredKeys = await getTouchEnrollKeys();
      restoredKeys[0][1].should.equal('0');
      restoredKeys[1][1].should.equal('1');
    });
  });
  
  describe('backup and restore defaults', async () => {
    async function setTouchEnrollMenuKeys (value) {
      for (let key of touchEnrollMenuKeys) {
        await setUserDefault(NS_USER_KEY_EQUIVALENTS, key, value);
      }
    }

    beforeEach(async () => {
      // Set the shortcuts to nothing
      await setTouchEnrollMenuKeys();
    });

    it('should restore defaults after calling setTouchEnrollKey and then calling restore', async () => {
      let originalValues = await getTouchEnrollKeys();
      await setTouchEnrollKey();
      await getTouchEnrollKeys().should.eventually.not.deep.equal(originalValues);
      await restoreTouchEnrollShortcuts();
      await getTouchEnrollKeys().should.eventually.deep.equal(originalValues);
    });

    it('should not do anything if restoring without backing up in the first place', async () => {
      let originalValues = await getTouchEnrollKeys();
      await restoreTouchEnrollShortcuts();
      await getTouchEnrollKeys().should.eventually.deep.equal(originalValues);
    });

    it('should restore to defaults even if we set touch enroll keys more than once', async () => {
      let originalValues = await getTouchEnrollKeys();
      await setTouchEnrollKey();
      await getTouchEnrollKeys().should.eventually.not.deep.equal(originalValues);
      await setTouchEnrollKey();
      await getTouchEnrollKeys().should.eventually.not.deep.equal(originalValues);
      await restoreTouchEnrollShortcuts();
      await getTouchEnrollKeys().should.eventually.deep.equal(originalValues);
    });
  });
});
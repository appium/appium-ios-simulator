 // transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Calendar from '../../lib/calendar';
import { fs } from 'appium-support';
import { copySync } from 'fs-extra';
import { execSQLiteQuery } from '../../lib/utils';
import sinon from 'sinon';

const { getCalendarDB, enableCalendarAccess, disableCalendarAccess } = Calendar;

chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let tccDir = `${assetsDir}/Library/TCC`;
let tccDirOriginal = `${assetsDir}/Library/TCC-Original`;

describe('Calendar.js', () => {

  beforeEach(async () => {
    await fs.rimraf(tccDir);
    copySync(tccDirOriginal, tccDir);
  });

  after(async () => {
    await fs.rimraf(tccDir);
  });

  describe('getCalendarDB()', () => {

    it('creates a new DB with a table named "access" if none existed in the first place', async () => {
      await fs.rimraf(tccDir);
      expect(await fs.exists(tccDir)).to.be.false;
      let db = await getCalendarDB(tccDir);
      expect(await fs.exists(tccDir)).to.be.true;
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access`);
      let count = parseInt(res.stdout.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });

    it('doesn\'t overwrite DB if one already exists', async () => {
      let db = await getCalendarDB(tccDir);
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access`);
      let count = parseInt(res.stdout.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });

  });

  describe('enableCalendarAccess()', () => {
    let db;
    let getCount = Calendar.getCalendarRowCount;
    let bundleID = 'com.fake.bundleid';

    before(async () => {
      db = await Calendar.getCalendarDB(assetsDir);
      sinon.stub(Calendar, 'getCalendarDB').returns(db);
    });

    after(() => {
      sinon.restore(Calendar, 'getCalendarDB');
    });

    it('adds an item to the "access" table called "kTCCServiceCalendar"', async () => {
      await getCount(db, bundleID).should.eventually.equal(0);
      await enableCalendarAccess(null, 'com.fake.bundleid');
      await getCount(db, bundleID).should.eventually.equal(1);
    });

    it('will not fail and will only creates one entry if we call enableCalendarAccess() twice', async () => {
      await getCount(db, bundleID).should.eventually.equal(0);
      await enableCalendarAccess(null, bundleID);
      await getCount(db, bundleID).should.eventually.equal(1);
      await enableCalendarAccess(null, bundleID);
      await getCount(db, bundleID).should.eventually.equal(1);
    });

    it('overwrites any previous entries', async () => {
      await execSQLiteQuery(db, `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '${bundleID}', 0, 0, 0, 0, 0);`);
      await getCount(db, bundleID).should.eventually.equal(1);
      let out = (await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`)).stdout;
      let allowed = parseInt(out.split('=')[1], 10);
      expect(allowed).to.equal(0);
      await enableCalendarAccess(null, bundleID);
      out = (await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`)).stdout;
      allowed = parseInt(out.split('=')[1], 10);
      expect(allowed).to.equal(1);
    });

    it('can enable and then disable', async () => {
      await getCount(db, bundleID).should.eventually.equal(0);
      await enableCalendarAccess(null, bundleID);
      await getCount(db, bundleID).should.eventually.equal(1);
      await disableCalendarAccess(null, bundleID);
      await getCount(db, bundleID).should.eventually.equal(0);
    });

    it('does nothing if disableCalendarAccess called without calendar access being enabled', async () => {
      await disableCalendarAccess(null, bundleID).should.not.be.rejected;
    });

  });
});

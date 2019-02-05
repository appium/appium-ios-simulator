// transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Calendar from '../../lib/calendar';
import { fs } from 'appium-support';
import { copySync } from 'fs-extra';
import { execSQLiteQuery } from '../../lib/utils';

chai.should();
chai.use(chaiAsPromised);
const expect = chai.expect;

const cwd = process.cwd();
const assetsDir = `${cwd}/test/assets`;
const tccDir = `${assetsDir}/Library/TCC`;
const tccDirOriginal = `${assetsDir}/Library/TCC-Original`;
const bundleID = 'com.fake.bundleid';

describe('Calendar.js', function () {
  let calendar;

  beforeEach(async function () {
    await fs.rimraf(tccDir);
    copySync(tccDirOriginal, tccDir);
    calendar = new Calendar({major: 9}, assetsDir);
  });

  after(async function () {
    await fs.rimraf(tccDir);
  });

  describe('getDB()', function () {

    it('creates a new DB with a table named "access" if none existed in the first place', async function () {
      await fs.rimraf(tccDir);
      expect(await fs.exists(tccDir)).to.be.false;
      await calendar.tccDb.getDB(); // Lazily creates the .db
      expect(await fs.exists(tccDir)).to.be.true;
      (await calendar.getCalendarRowCount(bundleID)).should.equal(0);
    });

    it('doesn\'t overwrite DB if one already exists', async function () {
      let db = await calendar.tccDb.getDB();
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access WHERE service='kTCCServiceCalendar'`);
      let count = parseInt(res.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });

  });

  describe('enableCalendarAccess()', function () {
    it('adds an item to the "access" table called "kTCCServiceCalendar"', async function () {
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(0);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
    });

    it('will not fail and will only creates one entry if we call enableCalendarAccess() twice', async function () {
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(0);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
    });

    it('overwrites any previous entries', async function () {
      let db = await calendar.tccDb.getDB();

      // Insert a entry into calendar with 'allowed = 0'
      await execSQLiteQuery(db, `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '${bundleID}', 0, 0, 0, 0, 0);`);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
      let out = await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`);
      let allowed = parseInt(out.split('=')[1], 10);
      allowed.should.equal(0);

      // Now enable the calendar access and check that 'allowed = 1'
      await calendar.enableCalendarAccess(bundleID);
      out = await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`);
      allowed = parseInt(out.split('=')[1], 10);
      expect(allowed).to.equal(1);
    });
  });

  describe('disableCalendarAccess()', function () {

    it('can enable and then disable', async function () {
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.false;
      await calendar.enableCalendarAccess(bundleID);
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.true;
      await calendar.disableCalendarAccess(bundleID);
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.false;
    });

    it('does nothing if disableCalendarAccess called without calendar access being enabled', async function () {
      await calendar.disableCalendarAccess(bundleID).should.not.be.rejected;
    });

  });
});

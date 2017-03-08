 // transpile:mocha

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Calendar from '../../lib/calendar';
import { fs } from 'appium-support';
import { copySync } from 'fs-extra';
import { execSQLiteQuery } from '../../lib/utils';

chai.should();
chai.use(chaiAsPromised);
let expect = chai.expect;

let cwd = process.cwd();
let assetsDir = `${cwd}/test/assets`;
let tccDir = `${assetsDir}/Library/TCC`;
let tccDirOriginal = `${assetsDir}/Library/TCC-Original`;
let bundleID = 'com.fake.bundleid';

describe('Calendar.js', () => {

  let calendar;

  beforeEach(async () => {
    await fs.rimraf(tccDir);
    copySync(tccDirOriginal, tccDir);
    calendar = new Calendar(assetsDir);
  });

  after(async () => {
    await fs.rimraf(tccDir);
  });

  describe('getDB()', () => {

    it('creates a new DB with a table named "access" if none existed in the first place', async () => {
      await fs.rimraf(tccDir);
      expect(await fs.exists(tccDir)).to.be.false;
      await calendar.getDB(); // Lazily creates the .db
      expect(await fs.exists(tccDir)).to.be.true;
      (await calendar.getCalendarRowCount(bundleID)).should.equal(0);
    });

    it('doesn\'t overwrite DB if one already exists', async () => {
      let db = await calendar.getDB();
      let res = await execSQLiteQuery(db, `SELECT count(*) FROM access WHERE service='kTCCServiceCalendar'`);
      let count = parseInt(res.stdout.split('=')[1].trim(), 10);
      expect(count).to.equal(0);
    });

  });

  describe('enableCalendarAccess()', () => {
    it('adds an item to the "access" table called "kTCCServiceCalendar"', async () => {
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(0);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
    });

    it('will not fail and will only creates one entry if we call enableCalendarAccess() twice', async () => {
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(0);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
      await calendar.enableCalendarAccess(bundleID);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
    });

    it('overwrites any previous entries', async () => {
      let db = await calendar.getDB();

      // Insert a entry into calendar with 'allowed = 0'
      await execSQLiteQuery(db, `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '${bundleID}', 0, 0, 0, 0, 0);`);
      await calendar.getCalendarRowCount(bundleID).should.eventually.equal(1);
      let out = (await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`)).stdout;
      let allowed = parseInt(out.split('=')[1], 10);
      allowed.should.equal(0);

      // Now enable the calendar access and check that 'allowed = 1'
      await calendar.enableCalendarAccess(bundleID);
      out = (await execSQLiteQuery(db, `SELECT allowed FROM 'access' WHERE client='${bundleID}' AND service='kTCCServiceCalendar'`)).stdout;
      allowed = parseInt(out.split('=')[1], 10);
      expect(allowed).to.equal(1);
    });
  });

  describe('disableCalendarAccess()', () => {

    it('can enable and then disable', async () => {
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.false;
      await calendar.enableCalendarAccess(bundleID);
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.true;
      await calendar.disableCalendarAccess(bundleID);
      await calendar.hasCalendarAccess(bundleID).should.eventually.be.false;
    });

    it('does nothing if disableCalendarAccess called without calendar access being enabled', async () => {
      await calendar.disableCalendarAccess(bundleID).should.not.be.rejected;
    });

  });
});

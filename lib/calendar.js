import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';

export default class Calendar {

  constructor (sharedResourcesDir) {
    this.sharedResourcesDir = sharedResourcesDir;
  }

  async getDB () {
    if (this.db) {
      return this.db;
    }

    let tccPath = path.resolve(this.sharedResourcesDir, 'Library', 'TCC');
    if (!(await fs.exists(tccPath))) {
      await mkdirp(tccPath);
    }

    this.db = path.resolve(tccPath, 'TCC.db');
    await execSQLiteQuery(this.db, `CREATE TABLE IF NOT EXISTS access (
      service TEXT NOT NULL DEFAULT '',
      client TEXT NOT NULL DEFAULT '',
      client_type INTEGER,
      allowed INTEGER,
      prompt_count INTEGER,
      csreq BLOB NOT NULL DEFAULT '',
      policy_ID INTEGER,
      PRIMARY KEY(service, client, client_type)
    );`.replace(/\n/g, ''));

    return this.db;
  }

  async getCalendarRowCount (bundleID) {
    let db = await this.getDB();
    let count = await execSQLiteQuery(db, `SELECT count(*) FROM access WHERE client='?' AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.stdout.split('=')[1], 10);
  }

  async hasCalendarAccess (bundleID) {
    let count = await execSQLiteQuery(await this.getDB(), `SELECT count(*) FROM access WHERE client='?' AND allowed=1 AND service='kTCCServiceCalendar';`, bundleID);
    return parseInt(count.stdout.split('=')[1], 10) > 0;
  }

  async enableCalendarAccess (bundleID) {
    let db = await this.getDB();

    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      await execSQLiteQuery(db, `UPDATE 'access' SET
        service='kTCCServiceCalendar',
        client_type=0,
        allowed=1,
        prompt_count=1,
        csreq=0
      WHERE client='?' AND service='kTCCServiceCalendar'`.replace(/\n/g, ' '), bundleID);
    } else {
      await execSQLiteQuery(db, `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '?', 0, 1, 1, 0, 0);`, bundleID);
    }
  }

  async disableCalendarAccess (bundleID) {
    let db = await this.getDB();

    if ((await this.getCalendarRowCount(bundleID)) > 0) {
      await execSQLiteQuery(db, `DELETE FROM 'access' WHERE client='?' AND service='kTCCServiceCalendar'`.replace(/\n/g, ' '), bundleID);
    }
  }
}

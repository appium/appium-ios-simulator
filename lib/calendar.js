import Simulator from './simulator-xcode-6';
import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';

class Calendar {

  /**
   * Get the path to the TCC.db
   * @param {string} sharedResourcesDir 
   */
  static async getCalendarDB (sharedResourcesDir) {
    let tccPath = path.resolve(sharedResourcesDir, 'Library', 'TCC');
    if (!(await fs.exists(tccPath))) {
      await mkdirp(tccPath);
    }
    
    let db = path.resolve(tccPath, 'TCC.db');
    await execSQLiteQuery(db, `CREATE TABLE IF NOT EXISTS access (
      service TEXT NOT NULL DEFAULT '', 
      client TEXT NOT NULL DEFAULT '', 
      client_type INTEGER,
      allowed INTEGER,
      prompt_count INTEGER,
      csreq BLOB NOT NULL DEFAULT '', 
      policy_ID INTEGER, 
      PRIMARY KEY(service, client, client_type)
    );`.replace(/\n/g, ''));

    return db;
  }

  static async getCalendarRowCount (db, bundleID) {
    let count = await execSQLiteQuery(db, `SELECT count(*) FROM access WHERE client='?';`, bundleID);
    return parseInt(count.stdout.split('=')[1], 10);
  }

  /**
   * Allow calendar access for UDID
   * @param {string} udid 
   * @param {string} bundleID 
   */
  static async enableCalendarAccess (udid, bundleID) {
    let pathToKeychain = path.resolve(new Simulator(udid).getDir());
    let db = await Calendar.getCalendarDB(pathToKeychain);

    if ((await Calendar.getCalendarRowCount(db, bundleID)) > 0) {
      await execSQLiteQuery(db, `UPDATE 'access' SET 
        service='kTCCServiceCalendar', 
        client='?',
        client_type=0, 
        allowed=1, 
        prompt_count=1,
        csreq=0
      WHERE client='?' AND service='kTCCServiceCalendar'`.replace(/\n/g, ' '), bundleID, bundleID);
    } else {
      await execSQLiteQuery(db, `INSERT INTO 'access' VALUES ('kTCCServiceCalendar', '?', 0, 1, 1, 0, 0);`, bundleID);
    }
  }
}

export default Calendar;
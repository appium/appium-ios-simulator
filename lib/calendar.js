import Simulator from './simulator-xcode-6';
import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';

async function getCalendarDB (sharedResourcesDir) {
  let tccPath = path.resolve(sharedResourcesDir, 'Libary', 'TCC');
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

async function enableCalendarAccess (udid) {
  let pathToKeychain = path.resolve(new Simulator(udid).getDir());
  let db = await getCalendarDB(pathToKeychain);
  return db;
}

export { enableCalendarAccess, getCalendarDB };
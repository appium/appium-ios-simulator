import crypto from 'crypto';
import { exec } from 'teen_process';
import path from 'path';
import { fs, mkdirp } from 'appium-support';
import { execSQLiteQuery } from './utils';
import log from './logger';
import _ from 'lodash';

const tset = `<?xml version="1.0" encoding="UTF-8"?>\n
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0">
    <array/>
</plist>`;

/**
 * Library for programatically adding certificates
 */
class Certificate {

  constructor (pemFilename) {
    this.pemFilename = pemFilename;
    this.opensslBinary = null;
    this.fingerprint = null;
    this.data = null;
    this.subject = null;
  }

  async openssl (...args) {
    if (!this.opensslBinary) {
      try {
        this.opensslBinary = await fs.which('openssl');
      } catch (e) {
        throw new Error('openssl executable cannot be found in PATH. Make sure it is installed');
      }
    }

    log.debug(`Executing ${this.opensslBinary} with arguments: ${args}`);
    let result;
    try {
      const {stdout} = await exec(this.opensslBinary, args);
      result = stdout;
    } catch (e) {
      if (e.stderr) {
        throw new Error(e.stderr);
      }
      throw e;
    }
    return result;
  }

  /**
   * Add a certificate to the TrustStore
   */
  async add (dir) {
    let data = (await this.getDerData(this.pemFilename)).toString('hex');
    let subject = (await this.getSubject(this.pemFilename));
    let sha1 = (await this.getFingerPrint(this.data)).toString('hex');

    let trustStore = new TrustStore(dir);
    return await trustStore.addRecord(sha1, tset, subject, data);
  }

  /**
   * Checks if keychain at given directory has this certificate
   */
  async has (dir) {
    let subject = await this.getSubject(this.pemFilename);
    let trustStore = new TrustStore(dir);

    // Return false if record with this subject is not found
    if (!await trustStore.hasRecords(subject)) {
      return false;
    }

    // If record is found, check fingerprints to verify that they didn't change
    let previousFingerprint = await trustStore.getFingerPrintFromRecord(subject);
    let currentFingerprint = await this.getFingerPrint();
    return previousFingerprint.toString() === currentFingerprint.toString();
  }

  /**
   * Remove certificate from the TrustStore
   */
  async remove (dir) {
    let subject = await this.getSubject(this.pemFilename);
    let trustStore = new TrustStore(dir);
    return await trustStore.removeRecord(subject);
  }

  /**
   * Translate PEM file to DER buffer
   */
  async getDerData () {
    if (this.data) {
      return this.data;
    }

    // Convert 'pem' file to 'der'
    const output = await this.openssl('x509',
      '-outform', 'der',
      '-in', this.pemFilename
    );
    this.data = Buffer.from(_.trim(output));
    return this.data;
  }

  /**
   * Get SHA1 fingerprint from der data before
   */
  async getFingerPrint () {
    if (this.fingerprint) {
      return this.fingerprint;
    }

    let data = await this.getDerData();
    let shasum = crypto.createHash('sha1');
    shasum.update(data);
    this.fingerprint = shasum.digest();
    return this.fingerprint;
  }

  /**
   * Parse the subject from the der data
   */
  async getSubject () {
    if (this.subject) {
      return this.subject;
    }

    const subject = await this.openssl('x509',
      '-noout', '-subject',
      '-in', this.pemFilename,
    );
    // https://github.com/appium/appium/issues/14666
    const match = /^\s*subject=.*\bCN\b\s*=\s*([^\n]+)$/m.exec(subject);
    if (!match) {
      log.debug(subject);
      throw new Error(`Cannot parse certificate subject from the openssl output`);
    }
    this.subject = match[1];
    return this.subject;
  }

}

/**
 * Interface for adding and removing records to TrustStore.sqlite3 databases that Keychains use
 */
class TrustStore {
  constructor (sharedResourceDir) {
    this.sharedResourceDir = sharedResourceDir;
  }

  /**
   * Get TrustStore database associated with this simulator
   */
  async getDB () {
    if (this.db) {
      return this.db;
    }

    // If the sim doesn't have a keychains directory, create one
    let keychainsPath = path.resolve(this.sharedResourceDir, 'Library', 'Keychains');
    if (!(await fs.exists(keychainsPath))) {
      await mkdirp(keychainsPath);
    }

    // Open sqlite database
    this.db = path.resolve(keychainsPath, 'TrustStore.sqlite3');

    // If it doesn't have a tsettings table, create one
    await execSQLiteQuery(this.db, `CREATE TABLE IF NOT EXISTS tsettings (sha1 BLOB NOT NULL DEFAULT '', subj BLOB NOT NULL DEFAULT '', tset BLOB, data BLOB, PRIMARY KEY(sha1));`);
    try {
      await execSQLiteQuery(this.db, 'CREATE INDEX isubj ON tsettings(subj);');
    } catch (e) { }


    return this.db;
  }

  /**
   * Add record to tsettings
   */
  async addRecord (sha1, tset, subj, data) {
    let db = await this.getDB();
    if (await this.hasRecords(subj)) {
      return await execSQLiteQuery(db, `UPDATE tsettings SET sha1=x'?', tset='?', data=x'?' WHERE subj='?'`, sha1, tset, data, subj);
    } else {
      return await execSQLiteQuery(db, `INSERT INTO tsettings (sha1, subj, tset, data) VALUES (x'?', '?', '?', x'?')`, sha1, subj, tset, data);
    }
  }

  /**
   * Remove record from tsettings that matches the subject
   * @param {string} subj
   */
  async removeRecord (subj) {
    return await execSQLiteQuery(await this.getDB(), `DELETE FROM tsettings WHERE subj = '?'`, subj);
  }

  /**
   * Get a record from tsettings that matches the subj
   * @param {string} subj
   */
  async hasRecords (subj) {
    return (await this.getRecordCount(subj)) > 0;
  }

  /**
   * Get count of how many records have this subject
   * @param {string} subj
   */
  async getRecordCount (subj) {
    let result = await execSQLiteQuery(await this.getDB(), `SELECT count(*) FROM tsettings WHERE subj = '?'`, subj);
    return parseInt(result.split('=')[1], 10);
  }

  /**
   * Get the SHA1 fingerprint for the record that has this subject
   * @param {string} subj
   */
  async getFingerPrintFromRecord (subj) {
    let result = await execSQLiteQuery(await this.getDB(), `SELECT sha1 FROM tsettings WHERE subj='?'`, subj);
    if (result) {
      return Buffer.from(result.split('=')[1].trim());
    }
  }
}

export default Certificate;
export { Certificate, TrustStore };

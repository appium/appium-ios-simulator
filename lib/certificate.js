import sqlite3 from 'sqlite3';
import Promise from 'bluebird';
import openssl from 'openssl-wrapper';
import crypto from 'crypto';

let tset = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n
    <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
    <plist version=\"1.0\">
    <array/>
</plist>`;

let _promiseCb = (resolve, reject) => {
  return (err, result) => {
    if (err) {
      reject(err);
    } else {
      resolve(result);
    }
  };
};

/**
 * Library for programatically adding certificates 
 */
class Certificate {

  /**
   * Add a certificate to the TrustStore
   */
  static async addCertificate (pemFilename, dir) {
    let data = await Certificate.pemFileToDer(pemFilename);
    let subject = await Certificate.getSubject(pemFilename);
    let fingerprint = await Certificate.getFingerPrint(data);
    let trustStore = new TrustStore(dir);
    trustStore.addRecord(fingerprint, tset, subject, data);
  }

  /**
   * Remove certificate from the TrustStore
   */
  async removeCertificate () { 

  }

  /**
   * Translate PEM file to DER buffer
   */
  static async pemFileToDer (infileName){
    return new Promise((resolve, reject) => { 
      // Convert 'pem' file to 'der'
      openssl('x509', {
        outform: 'der',
        in: infileName
      }, _promiseCb(resolve, reject));
    });
  }

  /**
   * Get SHA1 fingerprint from der data before
   */
  static getFingerPrint (data){
    let shasum = crypto.createHash('sha1');
    shasum.update(data);
    return shasum.digest();
  }

  /**
   * Parse the subject from the der data
   */
  static async getSubject (pemFilePath){
    return new Promise(async (resolve, reject) => {
      // Convert 'pem' file to 'der'
      openssl('x509', {
        noout: true,
        subject: true,
        in: pemFilePath
      }, async (err, subject) => {
        if (err) 
          reject(err);
        else {
          let subRegex = /^subject[\w\W]*\/CN=([\w\W]*)(\n)?/;
          resolve(new Buffer(subject.toString().match(subRegex)[1]));
        }
      });
    });
  }

}

/**
 * Interface for adding and removing records to TrustStore.sqlite3 databases that Keychains use
 */
class TrustStore {
  constructor (iphoneSharedResourcesDir) {
    this.sqliteDBPath = iphoneSharedResourcesDir + '/Library/Keychains/TrustStore.sqlite3';
    this.db = new sqlite3.Database(this.sqliteDBPath);
  }

  /**
   * Add record to tsettings
   */
  async addRecord (sha1, tset, subj, data) {
    let existingRecords = await this.getRecords(subj);

    let sqlQuery = existingRecords.length > 0 ?
      `UPDATE tsettings SET sha1=?, tset=?, data=? WHERE subj=?`
      : `INSERT INTO tsettings (sha1, subj, tset, data) VALUES (?, ?, ?, ?)`;


    return new Promise((resolve, reject) => {
      let statement = this.db.prepare(sqlQuery, (err) => {
        if (err) reject(err);
        if (existingRecords.length > 0)
          statement.run([sha1, tset, data, subj]);
        else
          statement.run([sha1, subj, tset, data]);
        statement.finalize(_promiseCb(resolve, reject));
      });
    });
  }

  /**
   * Remove record from tsettings
   */
  async removeRecord (subj) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM tsettings WHERE subj = '${subj}'`, 
        _promiseCb(resolve, reject)
      );
    });
  }

  /**
   * Get a record from tsettings
   */
  async getRecords (subj) {
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT sha1, subj, tset, data FROM tsettings WHERE subj = '${subj}'`, 
        _promiseCb(resolve, reject)
      );
    });
  }
}

export default Certificate;
export { Certificate, TrustStore };
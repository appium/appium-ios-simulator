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

  constructor (pemFilename){ 
    this.pemFilename = pemFilename;
  }

  /**
   * Add a certificate to the TrustStore
   */
  async add (dir) {
    let data = await this.getDerData(this.pemFilename);
    let subject = await this.getSubject(this.pemFilename);
    let fingerprint = await this.getFingerPrint(this.data);

    let trustStore = new TrustStore(dir);
    return trustStore.addRecord(fingerprint, tset, subject, data);
  }

  /**
   * Checks if keychain at given directory has this certificate
   */
  async has (dir) {
    let subject = await this.getSubject(this.pemFilename);

    let trustStore = new TrustStore(dir);
    let records = await trustStore.getRecords(subject);
    return records.length > 0;
  }

  /**
   * Remove certificate from the TrustStore
   */
  async remove (dir) { 
    let subject = await this.getSubject(this.pemFilename);
    let trustStore = new TrustStore(dir);
    return trustStore.removeRecord(subject);
  }

  /**
   * Translate PEM file to DER buffer
   */
  async getDerData (){
    if (this.data)
      return this.data;

    return new Promise((resolve, reject) => { 
      // Convert 'pem' file to 'der'
      openssl('x509', {
        outform: 'der',
        in: this.pemFilename
      }, _promiseCb(resolve, reject));
    });
  }

  /**
   * Get SHA1 fingerprint from der data before
   */
  async getFingerPrint (){
    if (this.fingerprint) 
      return this.fingerprint;

    let data = await this.getDerData();
    let shasum = crypto.createHash('sha1');
    shasum.update(data);
    this.fingerprint = shasum.digest();
    return this.fingerprint;
  }

  /**
   * Parse the subject from the der data
   */
  async getSubject (){
    if (this.subject)
      return this.subject;
      
    return new Promise(async (resolve, reject) => {
      // Convert 'pem' file to 'der'
      openssl('x509', {
        noout: true,
        subject: true,
        in: this.pemFilename
      }, async (err, subject) => {
        if (err) 
          reject(err);
        else {
          let subRegex = /^subject[\w\W]*\/CN=([\w\W]*)(\n)?/;
          resolve(subject.toString().match(subRegex)[1]);
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
    return new Promise(async (resolve, reject) => {
      let existingRecords = await this.getRecords(subj);
      if (existingRecords.length > 0){
        this.db.run(`UPDATE tsettings SET sha1=?, tset=?, data=? WHERE subj=?`, [sha1, tset, data, subj], _promiseCb(resolve, reject));
      } else {
        this.db.run(`INSERT INTO tsettings (sha1, subj, tset, data) VALUES (?, ?, ?, ?)`, [sha1, subj, tset, data], _promiseCb(resolve, reject));
      }
    });
  }

  /**
   * Remove record from tsettings
   */
  async removeRecord (subj) {
    return new Promise((resolve, reject) => {
      this.db.run(`DELETE FROM tsettings WHERE subj = ?`, [subj], _promiseCb(resolve, reject));
    });
  }

  /**
   * Get a record from tsettings
   */
  async getRecords (subj) {
    return new Promise((resolve, reject) => {
      this.db.all(`SELECT * FROM tsettings WHERE subj = ?`, [subj], _promiseCb(resolve, reject));
    }); 
  } 
}

export default Certificate;
export { Certificate, TrustStore }; 
import _ from 'lodash';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { exec } from 'teen_process';
import B from 'bluebird';
import log from './logger';

/**
 * Serializes the given value to plist-compatible
 * XML representation, which is ready for further usage
 * with `defaults` command line tool arguments
 *
 * @param {any} value The value to be serialized
 * @param {boolean} serialize [true] Whether to serialize the resulting
 * XML to string or to return raw HTMLElement instance
 * @returns {xmlDomElement|string} Either string or raw node representation of
 * the given value
 * @throws {TypeError} If it is not known how to serialize the given value
 */
export function toXmlArg (value, serialize = true) {
  let xmlDoc = null;

  if (_.isPlainObject(value)) {
    xmlDoc = new DOMParser().parseFromString('<dict></dict>', 'text/xml');
    for (const [subKey, subValue] of _.toPairs(value)) {
      const keyEl = xmlDoc.createElement('key');
      const keyTextEl = xmlDoc.createTextNode(subKey);
      keyEl.appendChild(keyTextEl);
      /** @type{xmlDomElement} */ (xmlDoc.documentElement).appendChild(keyEl);
      // @ts-ignore The typecast here is fine
      const subValueEl = xmlDoc.importNode(toXmlArg(subValue, false), true);
      /** @type{xmlDomElement} */ (xmlDoc.documentElement).appendChild(subValueEl);
    }
  } else if (_.isArray(value)) {
    xmlDoc = new DOMParser().parseFromString('<array></array>', 'text/xml');
    for (const subValue of value) {
      // @ts-ignore The typecast here is fine
      const subValueEl = xmlDoc.importNode(toXmlArg(subValue, false), true);
      /** @type{xmlDomElement} */ (xmlDoc.documentElement).appendChild(subValueEl);
    }
  } else if (_.isBoolean(value)) {
    xmlDoc = new DOMParser().parseFromString(value ? '<true/>' : '<false/>', 'text/xml');
  } else if (_.isInteger(value)) {
    xmlDoc = new DOMParser().parseFromString(`<integer>${value}</integer>`, 'text/xml');
  } else if (_.isNumber(value)) {
    xmlDoc = new DOMParser().parseFromString(`<real>${value}</real>`, 'text/xml');
  } else if (_.isString(value)) {
    xmlDoc = new DOMParser().parseFromString(`<string></string>`, 'text/xml');
    const valueTextEl = xmlDoc.createTextNode(value);
    /** @type{xmlDomElement} */ (xmlDoc.documentElement).appendChild(valueTextEl);
  }

  if (!xmlDoc) {
    throw new TypeError(`The defaults value ${JSON.stringify(value)} cannot be written, ` +
      `because it is not known how to handle its type`);
  }

  return serialize
    ? new XMLSerializer().serializeToString(/** @type{xmlDomElement} */ (xmlDoc.documentElement))
    : /** @type{xmlDomElement} */ (xmlDoc.documentElement);
}

/**
 * Generates command line args for the `defaults`
 * command line utility based on the given preference values mapping.
 * See https://shadowfile.inode.link/blog/2018/06/advanced-defaults1-usage/
 * for more details.
 *
 * @param {Object} valuesMap Preferences mapping
 * @param {Boolean} replace [false] Whether to generate arguments that replace
 * complex typed values like arrays or dictionaries in the current plist or
 * update them (the default settings)
 * @returns {string[][]} Each item in the array
 * is the `defaults write <plist>` command suffix
 */
export function generateDefaultsCommandArgs (valuesMap, replace = false) {
  /** @type {string[][]} */
  const resultArgs = [];
  for (const [key, value] of _.toPairs(valuesMap)) {
    try {
      if (!replace && _.isPlainObject(value)) {
        const dictArgs = [key, '-dict-add'];
        for (const [subKey, subValue] of _.toPairs(value)) {
          // @ts-ignore The typecast here is fine
          dictArgs.push(subKey, toXmlArg(subValue));
        }
        resultArgs.push(dictArgs);
      } else if (!replace && _.isArray(value)) {
        const arrayArgs = [key, '-array-add'];
        for (const subValue of value) {
          // @ts-ignore The typecast here is fine
          arrayArgs.push(toXmlArg(subValue));
        }
        resultArgs.push(arrayArgs);
      } else {
        // @ts-ignore The typecast here is fine
        resultArgs.push([key, toXmlArg(value)]);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        log.warn(e.message);
      } else {
        throw e;
      }
    }
  }
  return resultArgs;
}

export class NSUserDefaults {
  constructor (plist) {
    this.plist = plist;
  }

  /**
   * Reads the content of the given plist file using plutil command line tool
   * and serializes it to a JSON representation
   *
   * @returns {Promise<Record<string, any>>} The serialized plist content
   * @throws {Error} If there was an error during serialization
   */
  async asJson () {
    try {
      const {stdout} = await exec('plutil', ['-convert', 'json', '-o', '-', this.plist]);
      return JSON.parse(stdout);
    } catch (e) {
      throw new Error(`'${this.plist}' cannot be converted to JSON. Original error: ${e.stderr || e.message}`);
    }
  }

  /**
   * Updates the content of the given plist file.
   * If the plist does not exist yet then it is going to be created.
   *
   * @param {Object} valuesMap Mapping of preference values to update.
   * If any of item values are of dictionary type then only the first level dictionary gets
   * updated. Everything below this level will be replaced. This is the known limitation
   * of the `defaults` command line tool. A workaround for it would be to read the current
   * preferences mapping first and merge it with this value.
   * @throws {Error} If there was an error while updating the plist
   */
  async update (valuesMap) {
    if (!_.isPlainObject(valuesMap)) {
      throw new TypeError(`plist values must be a map. '${valuesMap}' is given instead`);
    }
    if (_.isEmpty(valuesMap)) {
      return;
    }

    const commandArgs = generateDefaultsCommandArgs(valuesMap);
    try {
      await B.all(commandArgs.map((args) => exec('defaults', ['write', this.plist, ...args])));
    } catch (e) {
      throw new Error(`Could not write defaults into '${this.plist}'. Original error: ${e.stderr || e.message}`);
    }
  }
}

/**
 * @typedef {import('@xmldom/xmldom').Element} xmlDomElement
 */

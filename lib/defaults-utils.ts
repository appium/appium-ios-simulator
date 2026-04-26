import {DOMParser, XMLSerializer, type Document, type Element} from '@xmldom/xmldom';
import {exec} from 'teen_process';
import {log} from './logger';
import {isPlainObject} from './utils';

export class NSUserDefaults {
  plist: string;

  constructor(plist: string) {
    this.plist = plist;
  }

  /**
   * Reads the content of the given plist file using plutil command line tool
   * and serializes it to a JSON representation
   *
   * @returns The serialized plist content
   * @throws {Error} If there was an error during serialization
   */
  async asJson(): Promise<Record<string, any>> {
    try {
      const {stdout} = await exec('plutil', ['-convert', 'json', '-o', '-', this.plist]);
      return JSON.parse(stdout);
    } catch (e: any) {
      throw new Error(
        `'${this.plist}' cannot be converted to JSON. Original error: ${e.stderr || e.message}`,
      );
    }
  }

  /**
   * Updates the content of the given plist file.
   * If the plist does not exist yet then it is going to be created.
   *
   * @param valuesMap Mapping of preference values to update.
   * If any of item values are of dictionary type then only the first level dictionary gets
   * updated. Everything below this level will be replaced. This is the known limitation
   * of the `defaults` command line tool. A workaround for it would be to read the current
   * preferences mapping first and merge it with this value.
   * @throws {Error} If there was an error while updating the plist
   */
  async update(valuesMap: Record<string, any>): Promise<void> {
    if (!isPlainObject(valuesMap)) {
      throw new TypeError(`plist values must be a map. '${valuesMap}' is given instead`);
    }
    if (Object.keys(valuesMap).length === 0) {
      return;
    }

    const commandArgs = generateDefaultsCommandArgs(valuesMap);
    try {
      await Promise.all(commandArgs.map((args) => exec('defaults', ['write', this.plist, ...args])));
    } catch (e: any) {
      throw new Error(
        `Could not write defaults into '${this.plist}'. Original error: ${e.stderr || e.message}`,
      );
    }
  }
}

/**
 * Serializes the given value to plist-compatible
 * XML representation, which is ready for further usage
 * with `defaults` command line tool arguments
 *
 * @param value The value to be serialized
 * @param serialize Whether to serialize the resulting
 * XML to string or to return raw HTMLElement instance
 * @returns Either string or raw node representation of
 * the given value
 * @throws {TypeError} If it is not known how to serialize the given value
 */
export function toXmlArg(value: any, serialize: boolean = true): string | Element {
  let xmlDoc: Document | null = null;

  if (isPlainObject(value)) {
    xmlDoc = new DOMParser().parseFromString('<dict></dict>', 'text/xml');
    const documentElement = requireDocumentElement(xmlDoc);
    for (const [subKey, subValue] of Object.entries(value)) {
      const keyEl = xmlDoc.createElement('key');
      const keyTextEl = xmlDoc.createTextNode(subKey);
      keyEl.appendChild(keyTextEl);
      documentElement.appendChild(keyEl);
      const subValueEl = xmlDoc.importNode(toXmlArg(subValue, false) as Element, true);
      documentElement.appendChild(subValueEl);
    }
  } else if (Array.isArray(value)) {
    xmlDoc = new DOMParser().parseFromString('<array></array>', 'text/xml');
    const documentElement = requireDocumentElement(xmlDoc);
    for (const subValue of value) {
      const subValueEl = xmlDoc.importNode(toXmlArg(subValue, false) as Element, true);
      documentElement.appendChild(subValueEl);
    }
  } else if (typeof value === 'boolean') {
    xmlDoc = new DOMParser().parseFromString(value ? '<true/>' : '<false/>', 'text/xml');
  } else if (Number.isInteger(value)) {
    xmlDoc = new DOMParser().parseFromString(`<integer>${value}</integer>`, 'text/xml');
  } else if (typeof value === 'number') {
    xmlDoc = new DOMParser().parseFromString(`<real>${value}</real>`, 'text/xml');
  } else if (typeof value === 'string') {
    xmlDoc = new DOMParser().parseFromString(`<string></string>`, 'text/xml');
    const valueTextEl = xmlDoc.createTextNode(value);
    requireDocumentElement(xmlDoc).appendChild(valueTextEl);
  }

  if (!xmlDoc) {
    throw new TypeError(
      `The defaults value ${JSON.stringify(value)} cannot be written, ` +
        `because it is not known how to handle its type`,
    );
  }

  const documentElement = requireDocumentElement(xmlDoc);
  return serialize ? new XMLSerializer().serializeToString(documentElement) : documentElement;
}

/**
 * Generates command line args for the `defaults`
 * command line utility based on the given preference values mapping.
 * See https://shadowfile.inode.link/blog/2018/06/advanced-defaults1-usage/
 * for more details.
 *
 * @param valuesMap Preferences mapping
 * @param replace Whether to generate arguments that replace
 * complex typed values like arrays or dictionaries in the current plist or
 * update them (the default settings)
 * @returns Each item in the array
 * is the `defaults write <plist>` command suffix
 */
export function generateDefaultsCommandArgs(
  valuesMap: Record<string, any>,
  replace: boolean = false,
): string[][] {
  const resultArgs: string[][] = [];
  for (const [key, value] of Object.entries(valuesMap)) {
    try {
      if (!replace && isPlainObject(value)) {
        const dictArgs = [key, '-dict-add'];
        for (const [subKey, subValue] of Object.entries(value)) {
          dictArgs.push(subKey, toXmlArg(subValue) as string);
        }
        resultArgs.push(dictArgs);
      } else if (!replace && Array.isArray(value)) {
        const arrayArgs = [key, '-array-add'];
        for (const subValue of value) {
          arrayArgs.push(toXmlArg(subValue) as string);
        }
        resultArgs.push(arrayArgs);
      } else {
        resultArgs.push([key, toXmlArg(value) as string]);
      }
    } catch (e) {
      if (e instanceof TypeError) {
        log.warn((e as Error).message);
      } else {
        throw e;
      }
    }
  }
  return resultArgs;
}

function requireDocumentElement(xmlDoc: Document): Element {
  const {documentElement} = xmlDoc;
  if (!documentElement) {
    throw new Error('Cannot parse XML document element');
  }
  return documentElement;
}


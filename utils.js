const fs = require('fs');
const path = require('path');
const PO = require('pofile');

/**
 * Recursively list all files in a directory.
 * @param dir {string} The directory to list files from.
 * @param fileList {string[]} The list of files to append to.
 * @returns {string[]} The list of files.
 */
function listFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    let filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      listFiles(filePath, fileList);
    } else {
      filePath = filePath
        .replace(__dirname, '')
        .replaceAll('\\', '/');
      fileList.push(filePath);
    }
  });

  return fileList;
}

exports.listFiles = listFiles;

/**
 * Translates a string.
 * @param str The string to translate.
 * @param poFile The PO file to use.
 * @param args The arguments to replace.
 * @returns {*|string} The translated string.
 */
function i18n(str, poFile, args) {
  const item = poFile.items.find(i => i.msgid === str);
  if (!item) {
    console.warn(`No translation found for "${str}"`);
  }
  str = (item && item.msgstr[0]) || str;
  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, args[i]);
  }
  return str;
}

exports.i18n = i18n;

/** @type {Map<string, PO>} */
const loadedPOFiles = new Map();

// returning reference
exports.getLoadedPOFiles = () => ({ loadedPOFiles });

/**
 * Gets the language data for the request. If the language code is not found, it will fall back to English.
 * @param req The request object.
 * @returns {Promise<{poFile: PO, langCode: string}>}
 */
async function getLanguageData(req) {
  let langCode = req.cookies['pxls-accept-language-override'] || 'en';
  const poDirFiles = fs.readdirSync(path.join(__dirname, 'po'));
  if (!poDirFiles.includes(`Localization${langCode === 'en' ? '' : '_' + langCode}.po`)) {
    langCode = 'en';
  }
  const poFile = await getPO(langCode);
  return { poFile, langCode };
}

exports.getLanguageData = getLanguageData;

/**
 * Gets the PO file for the language code.
 * @param langCode The language code.
 * @returns {Promise<PO>} A promise that resolves to the PO file.
 */
async function getPO(langCode) {
  if (loadedPOFiles.has(langCode)) {
    return loadedPOFiles.get(langCode);
  }
  const poFile = await loadPO(path.join(__dirname, 'po', `Localization${langCode === 'en' ? '' : '_' + langCode}.po`));
  loadedPOFiles.set(langCode, poFile);
  return poFile;
}

/**
 * Loads a PO file.
 * @param path The path to the PO file.
 * @returns {Promise<PO>} A promise that resolves to the PO file.
 */
function loadPO(path) {
  return new Promise((resolve, reject) => {
    PO.load(path, (error, poFile) => {
      if (error) {
        reject(error);
      } else {
        resolve(poFile);
      }
    });
  });
}

exports.loadPO = loadPO;

/**
 * Proxies a fetch request with request headers.
 * @param req The request object.
 * @param url The URL to proxy to.
 * @param options The fetch options.
 * @returns {Promise<Response>} A promise that resolves to the response.
 */
function proxyFetch(req, url, options = {}) {
  return fetch(url, {
    ...options,
    headers: req.headers
  });
}

exports.proxyFetch = proxyFetch;

exports.handlebarsHelpers = (poFile) => ({
  i18n: (str, ...args) => i18n(str, poFile, args),
  isoTime: (time) => new Date(time).toISOString(),
  localeDate: (time) => new Date(time * 1000).toLocaleString(),
  default: (value, defaultValue) => value || defaultValue,
  len: (value) => value.length,
  eq: (v1, v2) => v1 === v2,
  ne: (v1, v2) => v1 !== v2,
  lt: (v1, v2) => v1 < v2,
  gt: (v1, v2) => v1 > v2,
  lte: (v1, v2) => v1 <= v2,
  gte: (v1, v2) => v1 >= v2,
  and() {
    return Array.prototype.every.call(arguments, Boolean);
  },
  or() {
    return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
  }
});

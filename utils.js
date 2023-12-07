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

/**
 * Gets the language data for the request.
 * @param req The request object.
 * @returns {Promise<{poFile: PO, langCode: string}>}
 */
async function getLanguageData(req) {
  const langCode = req.cookies['pxls-accept-language-override'] || 'en';
  const poFile = await loadPO(path.join(__dirname, 'po', `Localization${langCode === 'en' ? '' : '_' + langCode}.po`));
  return { poFile, langCode };
}

exports.getLanguageData = getLanguageData;

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

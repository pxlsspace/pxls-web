const fs = require('fs');
const path = require('path');

const { listFiles } = require('../utils.js');
const { findTranslationCalls, contract, shave } = require('./localization-util');

const PO = require('pofile');
const esprima = require('esprima');

const views = listFiles('../views');

const handlebarsI18nMatch = /i18n (["'])(.+?)[^\\]+?\1/;
const handlebarsCommentMatch = /\{\{! +?(.+?) +?}}/;

const poFiles = new Map();

let stringCount = 0;

const offsetToLine = (text, offset) => Array.from(text.slice(0, offset).matchAll('\n')).length;
const globalOffsetToLocal = (text, offset) => offset - text.slice(0, offset).lastIndexOf('\n');

const itemsByIdByPofile = new Map();

function createPoFile(name) {
  const poFile = new PO();
  poFile.headers['Project-Id-Version'] = 'Pxls';
  poFile.headers['POT-Creation-Date'] = (new Date()).toISOString();
  // "Better written as…" no it's not - look at the context.
  /* eslint-disable-next-line dot-notation */
  poFile.headers['Language'] = '';
  poFile.headers['Content-Type'] = 'text/plain; charset=UTF-8';

  itemsByIdByPofile.set(name, new Map());
  poFiles.set(name, poFile);
}

for (const path of views) {
  const file = fs.readFileSync(path, 'utf8');
  const lines = file.split('\n').map(e => e.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const i18nMatch = line.match(handlebarsI18nMatch);
    const commentMatch = line.match(handlebarsCommentMatch);
    console.log(i18nMatch, commentMatch);
  }
}

return;

for (const path of PEBBLE_FILES) {
  const file = fs.readFileSync(path).toString();

  const commentsByLine = new Map();

  const comments = file.matchAll(PEBBLE_COMMENT_MATCH);

  for (const comment of comments) {
    const line = offsetToLine(file, comment.index);
    if (!commentsByLine.has(line)) {
      commentsByLine.set(line, []);
    }
    commentsByLine.get(line).push(shave(comment[0], 2));
  }

  const sections = file.matchAll(PEBBLE_CODE_MATCH);

  for (const section of sections) {
    const sectionOffset = section.index;
    const sectionLine = offsetToLine(file, section.index);

    const gettextCalls = section[0].matchAll(I18N_MATCH);

    for (const call of gettextCalls) {
      const callOffset = sectionOffset + call.index;
      const callLine = sectionLine + offsetToLine(section[0], call.index);
      const callLocalOffset = globalOffsetToLocal(file, callOffset);

      const params = [];

      let depth = 1;
      let callLength;

      for (let i = call.index + 5; i < section[0].length; i++) {
        let char = section[0][i];

        if (char === '\'' || char === '"') {
          const match = section[0].slice(i - 1).matchAll(STRING_MATCH).next();
          if (match.done) {
            throw new Error(`Template file is incorrect (unterminated string) at ${callLine}:${callLocalOffset}`);
          }
          i += match.value[0].length;
          params.push(contract(match.value[0], 1).replaceAll('\\\'', '\''));

          char = section[0][i];
        }

        if (char === '(') {
          depth++;
        } else if (char === ')') {
          depth--;
          if (depth === 0) {
            // Since we can calculate this, it's worth having
            // even if we don't currently use it.
            /* eslint-disable-next-line no-unused-vars */
            callLength = i;
            break;
          }
        }
      }

      const [poFileName, id] = params;

      if (!poFiles.has(poFileName)) {
        createPoFile(poFileName);
      }

      const poFile = poFiles.get(poFileName);

      const itemsById = itemsByIdByPofile.get(poFileName);

      if (!itemsById.has(id)) {
        stringCount++;
        const item = new PO.Item();
        itemsById.set(id, item);
        poFile.items.push(item);
      }

      const item = itemsById.get(id);

      item.msgid = id;
      // push reference only if unique
      if (item.references.indexOf(path) === -1) {
        // NOTE ([  ]): linenumber and position are cool to have, but they cause
        // too much noise in localization updates.
        // item.references.push(`${path}:${callLine + 1}:${callLocalOffset + 1}`);
        item.references.push(path);
      }

      if (commentsByLine.has(callLine - 1)) {
        item.extractedComments.push(...commentsByLine.get(callLine - 1));
      }

      if (commentsByLine.has(callLine)) {
        item.extractedComments.push(...commentsByLine.get(callLine));
      }
    }
  }
}

// TODO: maybe just use ttag instead?

const JS_FILES = [
  'public/pxls.js',
  'public/include/ban.js',
  'public/include/board.js',
  'public/include/chat.js',
  'public/include/chromeOffsetWorkaround.js',
  'public/include/coords.js',
  'public/include/grid.js',
  'public/include/helpers.js',
  'public/include/lookup.js',
  'public/include/modal.js',
  'public/include/nativeNotifications.js',
  'public/include/notifications.js',
  'public/include/overlays.js',
  'public/include/panels.js',
  'public/include/place.js',
  'public/include/query.js',
  'public/include/serviceworkers.js',
  'public/include/settings.js',
  'public/include/socket.js',
  'public/include/storage.js',
  'public/include/template.js',
  'public/include/timer.js',
  'public/include/typeahead.js',
  'public/include/uiHelper.js',
  'public/include/user.js',
  'public/admin/admin.js'
];

const JS_POFILE = 'Localization';

if (!poFiles.has(JS_POFILE)) {
  createPoFile(JS_POFILE);
}

const jsPoFile = poFiles.get(JS_POFILE);
const jsItemsById = itemsByIdByPofile.get(JS_POFILE);

const TRANSLATOR_COMMENT_REGEX = /^\s*translator:\s?(.*)$/i;

for (const path of JS_FILES) {
  const file = fs.readFileSync('../' + path).toString();
  const script = esprima.parseScript(file, { range: true, comment: true });

  const translatableStrings = script.body
    .map(findTranslationCalls)
    .flat()
    .map(e => e.arguments[0].range);

  for (const [start, end] of translatableStrings) {
    const relevantComments = script.comments.filter(comment => {
      const [commentStart, commentEnd] = comment.range;

      if (!TRANSLATOR_COMMENT_REGEX.test(comment.value)) {
        return false;
      }

      if (commentEnd < start) {
        // before string

        const newlineCount = Array.from(file
          .substring(commentEnd, start)
          .matchAll('\n')).length;

        return newlineCount < 2;
      } else {
        // after string

        const hasNewline = file
          .substring(end, commentStart)
          .indexOf('\n') !== -1;

        return !hasNewline;
      }
    }).map(comment => TRANSLATOR_COMMENT_REGEX.exec(comment.value)[1]);

    const id = contract(file.substring(start, end), 1);
    const callLine = offsetToLine(file, start);
    const callLocalOffset = globalOffsetToLocal(file, start);

    if (!jsItemsById.has(id)) {
      stringCount++;
      const item = new PO.Item();
      jsItemsById.set(id, item);
      jsPoFile.items.push(item);
    }

    const item = jsItemsById.get(id);

    item.msgid = id;

    // push reference only if unique
    if (item.references.indexOf(path) === -1) {
      // NOTE (Flying): The below logic will "double up" references for
      // JavaScript files. For example:
      //
      //   #: resources/public/include/chat.js
      //   #: resources/public/include/user.js
      //   #: resources/public/admin/admin.js
      //
      // will become:
      //
      //   #: resources/public/include/chat.js resources/public/include/user.js
      //   #: resources/public/admin/admin.js
      //
      // This is to remain consistent with how .po files are structured.
      // Copy/pasting them one-per-line into a .po file and running the
      // compile-localizations.js script will cause the output .properties file
      // to break like so:
      //
      //   #: resources/public/include/chat.js
      //    resources/public/include/user.js
      //   #: resources/public/admin/admin.js
      //
      // This should make it cleaner to create new localization files by
      // copying Localization.pot.

      // find last index of references ending in .js
      const lastJs = item.references.indexOf(item.references.filter(r => r.endsWith('.js')).reverse()[0]);
      // if the path doesn't end in .js, there are no .js files yet, or the
      // last .js file has a space in it (already "doubled up"), push like
      // normal and continue
      if (path.endsWith('.js') && lastJs !== -1 && !item.references[lastJs].includes(' ')) {
        item.references[lastJs] += ' ' + path;
      } else {
        // see note on html reference extraction.
        // item.references.push(`${path}:${callLine + 1}:${callLocalOffset + 1}`);
        item.references.push(path);
      }
    }

    for (const comment of relevantComments) {
      item.extractedComments.push(comment);
    }
  }

  // clear the strings array
  // because none of this code is well-structured
  translatableStrings.splice(0);
}

for (const [name, poFile] of poFiles.entries()) {
  poFile.save(`../po/${name}.pot`, e => e ? console.error : null);
}

console.info(`Parsed ${PEBBLE_FILES.length + JS_FILES.length} files.`);
console.info(`${stringCount} strings found.`);
console.info(`Output ${poFiles.size} files.`);

const fs = require('fs');

const { listFiles } = require('../utils.js');
const { findTranslationCalls, contract } = require('./localization-util');

const PO = require('pofile');
const esprima = require('esprima');
const Handlebars = require('@handlebars/parser');

const viewsFiles = listFiles('../views');
const jsFiles = listFiles('../public').filter(e => e.endsWith('.js'));

let stringCount = 0;

const TRANSLATOR_COMMENT_REGEX = /^\s*translator:\s?(.*)$/i;

const poFile = new PO();
poFile.headers['Project-Id-Version'] = 'Pxls';
poFile.headers['POT-Creation-Date'] = (new Date()).toISOString();
// "Better written as…" no it's not - look at the context.
/* eslint-disable-next-line dot-notation */
poFile.headers['Language'] = '';
poFile.headers['Content-Type'] = 'text/plain; charset=UTF-8';

const poItems = new Map();

function processNode(node, path, pendingComments = []) {
  if (node.type === 'CommentStatement' && !node.value.startsWith('\n')) {
    pendingComments.push(node.value);
  }
  if (node.type === 'MustacheStatement' && node.path.original === 'i18n') {
    const id = node.params[0].value;
    const item = poItems.get(id) || new PO.Item();
    item.msgid = id;
    item.references.push(path);
    item.extractedComments.push(...pendingComments);
    poItems.set(id, item);
    stringCount++;
    pendingComments.length = 0;
  }
  if (node.program) {
    for (const subNode of node.program.body) {
      processNode(subNode, path, pendingComments);
    }
  }
  if (node.inverse) {
    for (const subNode of node.inverse.body) {
      processNode(subNode, path, pendingComments);
    }
  }
}

for (const path of viewsFiles) {
  const file = fs.readFileSync(path, 'utf8');
  const ast = Handlebars.parse(file);

  for (const node of ast.body) {
    processNode(node, path);
  }
}

for (const path of jsFiles) {
  const file = fs.readFileSync(path, 'utf8');
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

    let item;

    if (poItems.has(id)) {
      item = poItems.get(id);
      if (!item.references.includes(path)) {
        item.references.push(path);
      }
      item.extractedComments.push(...relevantComments);
    } else {
      item = new PO.Item();
      item.msgid = id;
      item.references.push(path);
      item.extractedComments.push(...relevantComments);
      stringCount++;
      poItems.set(id, item);
    }

    // // push reference only if unique
    // if (item.references.indexOf(path) === -1) {
    //   const lastJs = item.references.indexOf(item.references.filter(r => r.endsWith('.js')).reverse()[0]);
    //   if (path.endsWith('.js') && lastJs !== -1 && !item.references[lastJs].includes(' ')) {
    //     item.references[lastJs] += ' ' + path;
    //   } else {
    //     item.references.push(path);
    //   }
    // }
    //
    // for (const comment of relevantComments) {
    //   item.extractedComments.push(comment);
    // }
  }

  // clear the strings array
  // because none of this code is well-structured
  translatableStrings.splice(0);
}

for (const item of poItems.values()) {
  poFile.items.push(item);
}

poFile.save('../po/Localization.pot', e => e ? console.error : null);

console.info(`Parsed ${viewsFiles.length + jsFiles.length} files.`);
console.info(`${stringCount} strings found.`);
console.info('Output ../po/Localization.pot.');

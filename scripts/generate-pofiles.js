const fs = require('fs');
const path = require('path');

const PO = require('pofile');

const currentPOT = PO.parse(fs.readFileSync(path.join(__dirname, '..', 'po', 'Localization.pot'), 'utf8'));

for (const fileName of fs.readdirSync(path.join(__dirname, '..', 'po'))) {
  if (!fileName.endsWith('.po')) continue;

  let stringCount = 0;

  const oldPO = PO.parse(fs.readFileSync(path.join(__dirname, '..', 'po', fileName), 'utf8'));

  let shortLanguage = fileName.replace(/^Localization_?|\.po$/g, '');
  if (shortLanguage === '') shortLanguage = 'en';
  let language;
  switch (shortLanguage) {
    case 'bg': language = 'Bulgarian'; break;
    case 'de': language = 'German'; break;
    case 'fi': language = 'Finnish'; break;
    case 'fr': language = 'French'; break;
    // case 'lv'
    case 'ru': language = 'Russian'; break;
    case 'sv': language = 'Swedish'; break;
    case 'tok': language = 'Tok Pisin'; break;
    case 'en': language = 'English'; break;
  }

  const newPO = new PO();
  newPO.headers['Project-Id-Version'] = currentPOT.headers['Project-Id-Version'];
  newPO.headers['POT-Creation-Date'] = currentPOT.headers['POT-Creation-Date'];
  newPO.headers['PO-Revision-Date'] = (new Date()).toISOString();
  newPO.headers['Last-Translator'] = 'Automatic generation';
  if (language) newPO.headers['Language-Team'] = language;
  // "Better written as…" no it's not - look at the context.
  /* eslint-disable-next-line dot-notation */
  newPO.headers['Language'] = shortLanguage;
  newPO.headers['Content-Type'] = 'text/plain; charset=UTF-8';
  newPO.headers['X-Generator'] = 'Pxls localization generator';

  currentPOT.items.forEach(item => {
    stringCount++;

    const oldItem = oldPO.items.find(i => i.msgid === item.msgid);

    const newItem = new PO.Item();
    newItem.obsolete = item.obsolete;
    newItem.comments = item.comments;
    newItem.extractedComments = item.extractedComments;
    newItem.references = item.references;
    newItem.flags = item.flags;
    newItem.msgctxt = item.msgctxt;
    newItem.msgid = item.msgid;
    newItem.msgid_plural = item.msgid_plural;
    newItem.msgstr = oldItem && (oldItem.msgstr !== item.msgid) ? oldItem.msgstr : '';

    newPO.items.push(newItem);
  });

  const outPath = path.join(__dirname, '..', 'po', fileName);
  newPO.save(outPath, e => e ? console.error : null);

  console.info(stringCount, 'strings found for', language ?? 'Unknown language');
  console.info('Output', outPath);
}

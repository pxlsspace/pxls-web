const path = require('path');
const fs = require('fs');
const PO = require('pofile');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { create } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const express = require('express');

const app = express();
const hbs = create({
  partialsDir: path.join(__dirname, 'views', 'partials')
});
const port = 3000;

app.use(cookieParser());
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

const filesInDist = listFiles(path.join('dist')).map(file => file.replace('dist/', ''));

const handebarsHelpers = (poFile) => ({
  i18n: (str, ...args) => i18n(str, poFile, args),
  isoTime: (time) => new Date(time).toISOString(),
  default: (value, defaultValue) => value || defaultValue,
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

const proxy = createProxyMiddleware({
  target: 'http://localhost:4567',
  changeOrigin: true,
  selfHandleResponse: true,
  onProxyRes: async function (proxyRes, req, res) {
    if (proxyRes.statusCode >= 400) {
      await sendErrorPage(req, res, proxyRes.statusCode);
      return;
    }
    res.status(proxyRes.statusCode);
    res.set(proxyRes.headers);
    proxyRes.pipe(res);
  }
});

const wsProxy = createProxyMiddleware({
  target: 'ws://localhost:4567/ws',
  changeOrigin: true,
  ws: true,
  onProxyReq: function (proxyReq, req, res) {
    res.send();
  }
});

const loadPO = (path) => new Promise((resolve, reject) => {
  PO.load(path, (error, pofile) => {
    if (error) {
      reject(error);
    } else {
      resolve(pofile);
    }
  });
});

function i18n(str, poFile, args) {
  const item = poFile.items.find(i => i.msgid === str);
  if (!item) {
    console.warn(`No translation found for ${str}`);
  }
  str = (item && item.msgstr[0]) || str;
  for (let i = 0; i < args.length; i++) {
    str = str.replace(`{${i}}`, args[i]);
  }
  return str;
}

app.use('/', async (req, res, next) => {
  const fileName = req.path.slice(1);
  const filePath = path.join(__dirname, 'dist', fileName);
  const langCode = req.cookies['pxls-accept-language-override'] || 'en';
  let poFile;
  try {
    poFile = await loadPO(path.join(__dirname, 'po', `Localization${langCode === 'en' ? '' : '_' + langCode}.po`));
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
    return;
  }

  const proxyFetch = (url, options = {}) => fetch(url, {
    headers: req.headers,
    ...options
  });

  if (fileName === '') {
    res.render('index', {
      title: 'pxls.space',
      lang: langCode,
      head: '',
      scriptLang: langCode === 'en' ? '' : '_' + langCode,

      helpers: {
        i18n: (str, ...args) => i18n(str, poFile, args)
      }
    });
  } else if (/^profile$|profile\/(?!js|css)/.test(fileName)) {
    // get profile data
    let profileName = fileName.split('/')[1] || '';
    if (profileName !== '') profileName = '?username=' + profileName;
    const dataRes = await proxyFetch('http://localhost:4567/api/v1/profile' + profileName);
    if (dataRes.status >= 400) {
      await sendErrorPage(req, res, dataRes.status);
      return;
    }
    const data = await dataRes.json();
    if (data.details && data.details === 'USER_NOT_FOUND') {
      await sendErrorPage(req, res, 404);
      return;
    }
    res.render('profile', {
      profile_of: {
        id: data.user.id,
        name: data.user.username,
        displayedFactionId: data.user.displayedFactionId,
        signupTime: data.user.signupTime,
        signupTimeFormatted: new Date(+data.user.signupTime).toLocaleString(),
        allTimePixelCount: data.user.pixelCountAllTime,
        pixelCount: data.user.pixelCount,
        discordName: data.user.discordName,
        getRolesString: data.user.roleNames,
        isBanned: data.user.isBanned,
        isPermaBanned: data.user.isPermaBanned,
        getBanExpiryTime: data.user.banExpiry,
        getBanExpiryTimeFormatted: new Date(+data.user.banExpiry).toLocaleString(),
        isChatbanned: data.user.isChatBanned,
        isPermaChatbanned: data.user.isPermaChatBanned,
        getChatBanExpiryTime: data.user.chatBanExpiry,
        getChatBanExpiryTimeFormatted: new Date(+data.user.chatBanExpiry).toLocaleString(),
        isFactionRestricted: data.user.isFactionRestricted
      },
      route_root: '/' + fileName,
      username: data.user.username,
      requested_self: data.self.id === data.user.id,
      requesting_user: {
        id: data.self.id,
        name: data.self.username,
        pixelCountAllTime: data.self.pixelCountAllTime
      },
      palette: data.palette,
      max_faction_tag_length: data.maxFactionTagLength,
      max_faction_name_length: data.maxFactionNameLength,
      canvas_reports_open_count: data.canvasReports.length,
      canvas_reports_length: data.canvasReports.length,
      chat_reports_open_count: data.chatReports.length,
      chat_reports_length: data.chatReports.length,
      snip_mode: data.snipMode,
      canvas_reports: data.canvasReports,
      chat_reports: data.chatReports,
      factions: data.user.factions,
      keys: data.keys,

      helpers: {
        factionById: (id) => data.user.factions.find(f => f.id === id),
        displayedFaction: () => data.user.factions.find(f => f.id === data.user.displayedFactionId),

        ...handebarsHelpers(poFile)
      }
    });
  } else if (filesInDist.includes(fileName)) {
    res.sendFile(filePath);
  } else if (req.path.startsWith('/ws')) {
    wsProxy(req, res, next);
  } else {
    proxy(req, res, next);
  }
});

async function sendErrorPage(req, res, code) {
  const langCode = req.cookies['pxls-accept-language-override'] || 'en';
  let poFile;
  try {
    poFile = await loadPO(path.join(__dirname, 'po', `Localization${langCode === 'en' ? '' : '_' + langCode}.po`));
  } catch (e) {
    console.error(e);
    res.status(500).send('Internal Server Error');
    return;
  }

  res.render('404', {
    palette: 'FFFFFF,C2CBD4,858D98,4B4F58,22272D,000000,38271D,6C422C,BC7541,FFB27F,FFD6BF,FEB2D9,F854CF,C785F3,9C29BC,562972,1E1E5B,153FA2,1C95DF,A0E8FF,17A8A3,226677,094C45,278242,43C91E,B7F954,FFFFAF,FAE70F,FEA815,EA5B15,5A0400,990700,D81515,FF635E',
    max_faction_tag_length: 5,
    max_faction_name_length: 20,
    requesting_user: {
      name: 'Vanilla'
    },
    err: code,

    helpers: handebarsHelpers(poFile)
  });
}

function listFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      listFiles(filePath, fileList);
    } else {
      fileList.push(filePath.replace(__dirname, '').replaceAll('\\', '/'));
    }
  });

  return fileList;
}

app.listen(port, () => console.info('Listening at http://localhost:3000/'));

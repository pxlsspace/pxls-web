const path = require('path');
const http = require('http');
const readline = require('readline');

const { createProxyMiddleware } = require('http-proxy-middleware');
const { create } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const express = require('express');

const { listFiles, getLanguageData, getLoadedPOFiles, handlebarsHelpers } = require('./utils');

const app = express();
const server = http.createServer(app);
const hbs = create({
  partialsDir: path.join(__dirname, 'views', 'partials')
});
const port = 3000;

app.use(cookieParser());
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

const filesInDist = listFiles(path.join('dist')).map(file => file.replace('dist/', ''));

const proxy = createProxyMiddleware({
  target: 'http://localhost:4567',
  changeOrigin: true,
  selfHandleResponse: true,
  logLevel: 'error',
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
  logLevel: 'error'
});

server.on('upgrade', wsProxy.upgrade);

app.use('/', async (req, res, next) => {
  const relativePath = req.path.slice(1);
  const filePath = path.join(__dirname, 'dist', relativePath);
  const { poFile, langCode } = await getLanguageData(req);

  const proxyFetch = (url, options = {}) => fetch(url, {
    ...options,
    headers: req.headers
  });

  if (req.path === '/') {
    res.render('index', {
      title: 'pxls.space',
      lang: langCode,
      head: '',
      scriptLang: langCode === 'en' ? '' : '_' + langCode,

      helpers: handlebarsHelpers(poFile)
    });
  } else if (/^profile$|profile\/(?!js|css)/.test(relativePath)) {
    // get profile data
    let profileName = relativePath.split('/')[1] || '';
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
    // console.dir(data, { depth: null });
    res.render('profile', {
      ...data,
      user: {
        ...data.user,
        signupTimeFormatted: new Date(+data.user.signupTime).toLocaleString(),
        banExpiryFormatted: new Date(+data.user.banExpiry).toLocaleString(),
        chatBanExpiryFormatted: new Date(+data.user.chatBanExpiry).toLocaleString()
      },
      isSelf: data.user.id === data.self.id,
      routeRoot: req.path,
      canvasReportsOpenCount: data.canvasReports.filter(r => !r.closed).length,
      chatReportsOpenCount: data.chatReports.filter(r => !r.closed).length,

      helpers: {
        displayedFaction: () => data.user.factions.find(f => f.id === data.user.displayedFactionId),

        ...handlebarsHelpers(poFile)
      }
    });
  } else if (filesInDist.includes(relativePath)) {
    res.sendFile(filePath);
  } else if (req.path.startsWith('/ws')) {
    wsProxy(req, res, next);
  } else {
    proxy(req, res, next);
  }
});

async function sendErrorPage(req, res, code) {
  const { poFile } = await getLanguageData(req);

  res.status(code).render('404', {
    palette: 'FFFFFF,C2CBD4,858D98,4B4F58,22272D,000000,38271D,6C422C,BC7541,FFB27F,FFD6BF,FEB2D9,F854CF,C785F3,9C29BC,562972,1E1E5B,153FA2,1C95DF,A0E8FF,17A8A3,226677,094C45,278242,43C91E,B7F954,FFFFAF,FAE70F,FEA815,EA5B15,5A0400,990700,D81515,FF635E',
    max_faction_tag_length: 5,
    max_faction_name_length: 20,
    requesting_user: {
      name: 'Vanilla'
    },
    err: code,

    helpers: handlebarsHelpers(poFile)
  });
}

server.listen(port, () => {
  console.info(`Listening at http://localhost:${port}/`);
  // terminal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  });
  const exit = () => {
    console.info('Goodbye');
    server.close();
    process.exit();
  };
  rl.on('SIGINT', () => exit);
  rl.on('line', line => {
    const args = line.split(' ');
    const command = args[0].toLowerCase();
    args.shift();

    if (command === 'reload') {
      const { loadedPOFiles } = getLoadedPOFiles();
      loadedPOFiles.clear();
      console.info('Cleared PO file cache');
    } else if (command === 'exit') {
      exit();
    }
    rl.prompt();
  });
});

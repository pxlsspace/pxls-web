const path = require('path');
const http = require('http');
const readline = require('readline');

const { createProxyMiddleware } = require('http-proxy-middleware');
const { create } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const express = require('express');
require('json5/lib/register');

const { listFiles, getLanguageData, getLoadedPOFiles, handlebarsHelpers, proxyFetch } = require('./utils');
const config = require('./config.json5');

const app = express();
const server = http.createServer(app);
const hbs = create({
  partialsDir: path.join(__dirname, 'views', 'partials')
});

app.use(cookieParser());
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

const filesInDist = listFiles(path.join('dist')).map(file => file.replace('dist/', ''));

const proxy = createProxyMiddleware({
  target: 'http://' + config.proxyTo,
  changeOrigin: true,
  selfHandleResponse: true,
  logLevel: 'error',
  onProxyRes: async function (proxyRes, req, res) {
    if (proxyRes.statusCode >= 400 && req.method === 'GET') {
      await sendErrorPage(req, res, proxyRes.statusCode);
      return;
    }
    res.status(proxyRes.statusCode);
    res.set(proxyRes.headers);
    proxyRes.pipe(res);
  }
});

const wsProxy = createProxyMiddleware({
  target: `ws://${config.proxyTo}/ws`,
  changeOrigin: true,
  ws: true,
  logLevel: 'error'
});

server.on('upgrade', wsProxy.upgrade);

app.use('/', async (req, res, next) => {
  const relativePath = req.path.slice(1);
  const filePath = path.join(__dirname, 'dist', relativePath);
  const { poFile, langCode } = await getLanguageData(req);

  if (req.path === '/') {
    res.render('index', {
      title: config.title,
      lang: langCode,
      scriptLang: langCode === 'en' ? '' : '_' + langCode,

      helpers: handlebarsHelpers(poFile)
    });
  } else if (/^\/profile(?:\/[\w-]+)?$/.test(req.path)) {
    let profileName = relativePath.split('/')[1] || '';
    if (profileName !== '') profileName = '?username=' + profileName;
    /** @type {Response} */
    let dataRes;
    try {
      dataRes = await proxyFetch(req, `http://${config.proxyTo}/api/v1/profile` + profileName);
    } catch (err) {
      const code = err.status || 500;
      await sendErrorPage(req, res, code);
      return;
    }
    const data = await dataRes.json();
    if (data.details && data.details === 'USER_NOT_FOUND') {
      await sendErrorPage(req, res, 404);
      return;
    }
    res.render('profile', {
      title: config.title,
      ...data,
      user: {
        ...data.user,
        signupTimeFormatted: new Date(data.user.signupTime).toLocaleString(),
        banExpiryFormatted: new Date(data.user.banExpiry).toLocaleString(),
        chatBanExpiryFormatted: new Date(data.user.chatBanExpiry).toLocaleString()
      },
      isSelf: data.user.id === data.self.id,
      routeRoot: req.path,
      canvasReportsOpenCount: (data.canvasReports || []).filter(r => !r.closed).length,
      chatReportsOpenCount: (data.chatReports || []).filter(r => !r.closed).length,

      helpers: {
        displayedFaction: () => data.user.factions.find(f => f.id === data.user.displayedFactionId),

        ...handlebarsHelpers(poFile)
      }
    });
  } else if (filesInDist.includes(relativePath)) {
    res.sendFile(filePath);
  } else if (req.path === '/ws') {
    wsProxy(req, res, next);
  } else {
    proxy(req, res, next);
  }
});

async function sendErrorPage(req, res, code) {
  const { poFile } = await getLanguageData(req);

  let name = '';
  await proxyFetch(req, `http://${config.proxyTo}/whoami`)
    .then(res => res.json())
    .then(data => {
      name = data.username;
    })
    .catch(() => {});

  res.status(code).render('error', {
    title: config.title,
    self: {
      name
    },
    err: code,

    helpers: handlebarsHelpers(poFile)
  });
}

server.listen(config.port, () => {
  console.info(`Listening at http://localhost:${config.port}/`);

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
  process.on('SIGINT', exit);
  rl.on('SIGINT', exit);
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

const path = require('path');
const fs = require('fs');
const PO = require('pofile');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { create } = require('express-handlebars');
const cookieParser = require('cookie-parser');
const express = require('express');

const app = express();
const hbs = create({
    partialsDir: path.join(__dirname, 'views', 'partials'),
});
const port = 3000;

app.use(cookieParser());
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

const filesInDist = listFiles(path.join('dist')).map(file => file.replace('dist/', ''));

const proxy = createProxyMiddleware({
    target: 'http://localhost:4567',
    changeOrigin: true
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
    str = item && item.msgstr[0] || str;
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
    if (fileName === '') {
        res.render('index', {
            title: 'pxls.space',
            lang: langCode,
            head: '',
            scriptLang: langCode === 'en' ? '' : '_' + langCode,

            helpers: {
                i18n: (str, ...args) => i18n(str, poFile, args),
            },
        });
    } else if (/^profile$|profile\/(?!js|css)/.test(fileName)) {
        console.log('rendering profile page', fileName);
        res.render('profile', {
            title: 'pxls.space',
            lang: langCode,
            head: '',
            scriptLang: langCode === 'en' ? '' : '_' + langCode,

            profile_of: {
                name: 'PROFILENAME',
                displayedFaction: 1,
                fetchDisplayedFaction: {
                    tag: 'FACTIONTAG',
                    name: 'FACTIONNAME',
                    id: 1,
                },
                signupTime: 0,
                signupTimeFormatted: '1970-01-01 00:00:00',
                allTimePixelCount: 420,
                pixelCount: 69,
                discordName: 'DISCORDNAME',
                getRolesString: 'ROLESTRING',
                isBanned: false,
                isPermaBanned: false,
                getBanExpiryTime: 0,
                getBanExpiryTimeFormatted: '1970-01-01 00:00:00',
                isChatbanned: false,
                isPermaChatbanned: false,
                getChatBanExpiryTime: 0,
                getChatBanExpiryTimeFormatted: '1970-01-01 00:00:00',
                isFactionRestricted: false,
            },
            route_root: '/' + fileName,
            username: 'USERNAME',
            requested_self: true,
            requesting_user: {
                name: 'Vanilla'
            },
            palette: 'FFFFFF,C2CBD4,858D98,4B4F58,22272D,000000,38271D,6C422C,BC7541,FFB27F,FFD6BF,FEB2D9,F854CF,C785F3,9C29BC,562972,1E1E5B,153FA2,1C95DF,A0E8FF,17A8A3,226677,094C45,278242,43C91E,B7F954,FFFFAF,FAE70F,FEA815,EA5B15,5A0400,990700,D81515,FF635E',
            max_faction_tag_length: 5,
            max_faction_name_length: 20,
            canvas_reports_open_count: 0,
            canvas_reports_length: 0,
            chat_reports_open_count: 0,
            chat_reports_length: 0,
            snip_mode: false,
            reportedName: 'REPORTEDNAME', // -snip- if snip_mode
            canvas_reports: [
                {
                    closed: false,
                    time: 0,
                    message: 'REPORTMESSAGE',
                }
            ],
            chat_reports: [
                {
                    closed: false,
                    time: 0,
                    report_message: 'REPORTMESSAGE',
                }
            ],
            factions: [
                {
                    id: 1,
                    name: 'FACTIONNAME',
                    tag: 'FACTIONTAG',
                    color: 1,
                    fetchMembers: [
                        {}
                    ],
                    fetchOwner: {
                        name: 'OWNERNAME',
                    }
                }
            ],
            keys: [
                {
                    key: 'KEY',
                    value: 'VALUE',
                }
            ],

            helpers: {
                i18n: (str, ...args) => i18n(str, poFile, args),
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
            },
        });
    } else if (filesInDist.includes(fileName)) {
        console.log('serving ' + fileName);
        res.sendFile(filePath);
    } else if (req.path.startsWith('/ws')) {
        wsProxy(req, res, next);
    } else {
        console.log('proxying ' + req.path);
        proxy(req, res, next);
    }
    // if (fileName === '') {
    //     const langCode = req.cookies['pxls-accept-language-override'] || 'en';
    //     PO.load(path.join(__dirname, 'po', `Localization${langCode === 'en' ? '' : '_' + langCode}.po`), (error, pofile) => {
    //         if (error) {
    //             console.error(error);
    //             res.status(500).send('Internal Server Error');
    //             return;
    //         }
    //         res.render('index', {
    //             title: 'pxls.space',
    //             lang: langCode,
    //             head: '',
    //             scriptLang: langCode === 'en' ? '' : '_' + langCode,
    //
    //             helpers: {
    //                 i18n: function (str) {
    //                     const item = pofile.items.find(i => i.msgid === str);
    //                     if (!item) {
    //                         console.warn(`No translation found for ${str}`);
    //                     }
    //                     return (item && item.msgstr[0]) || str;
    //                 },
    //             }
    //         });
    //     });
    //     return;
    // }
    // const filePath = path.join(__dirname, 'dist', fileName);
    // if (filesInDist.includes(fileName)) {
    //     res.sendFile(filePath);
    // } else if (req.path.startsWith('/ws')) {
    //     wsProxy(req, res, next);
    // } else {
    //     proxy(req, res, next);
    // }
});

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

app.listen(port, () => console.log(`Example app listening on port ${port}!`));

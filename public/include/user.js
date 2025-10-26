const { ls } = require('./storage');
const { socket } = require('./socket');
const { modal } = require('./modal');
const { place } = require('./place');
const { chat } = require('./chat');
const { lookup } = require('./lookup');
const { ban } = require('./ban');

const { analytics } = require('./helpers');

// this holds user stuff / info
const user = (function() {
  const self = {
    instaban: false,
    elements: {
      users: $('#online-count-value'),
      userInfo: $('#user-info'),
      pixelCounts: $('.pixel-counts'),
      currentPixelCount: $('#current-pixel-count'),
      alltimePixelCount: $('#alltime-pixel-count'),
      loginOverlay: $('#login-overlay'),
      signInWith: $('#sign-in-with'),
      legal: $('#legal'),
      userMessage: $('#user-message'),
      prompt: $('#prompt'),
      signup: $('#signup')
    },
    roles: [],
    pendingSignupToken: null,
    loggedIn: false,
    username: '',
    placementOverrides: null,
    chatNameColor: 0,
    getRoles: () => self.roles,
    isStaff: () => self.hasPermission('user.admin'),
    isDonator: () => self.hasPermission('user.donator'),
    getPermissions: () => {
      let perms = [];
      self.roles.flatMap(function loop(node) {
        if (node.inherits.length > 0) {
          perms.push(...node.permissions);
          return node.inherits.flatMap(loop);
        } else {
          perms.push(node.permissions);
        }
      });
      // NOTE: Slightly hacky fix for arrays showing up in permissions
      perms = perms.flatMap(permissions => permissions);
      return [...new Set(perms)];
    },
    hasPermission: node => self.getPermissions().includes(node),
    getUsername: () => self.username,
    getPixelCount: () => self.pixelCount,
    getPixelCountAllTime: () => self.pixelCountAllTime,
    signin: function() {
      const data = ls.get('auth_respond');
      if (!data) {
        return;
      }
      ls.remove('auth_respond');
      if (data.signup) {
        self.pendingSignupToken = data.token;
        self.elements.signup.fadeIn(200);
      } else {
        socket.reconnectSocket();
      }
      self.elements.prompt.fadeOut(200);
    },
    isLoggedIn: function() {
      return self.loggedIn;
    },
    webinit: function(data) {
      if (data.legal.termsUrl) {
        self.elements.legal.html(__('By logging in or registering, you agree to the <a href="{0}" target="_blank">terms of use</a> and <a href="{1}" target="_blank">privacy policy</a>.')
          .replace('{0}', data.legal.termsUrl)
          .replace('{1}', data.legal.privacyUrl));
      }
    },
    wsinit: function() {
      if (ls.get('auth_proceed')) {
        // we need to authenticate...
        ls.remove('auth_proceed');
        self.signin();
      }
    },
    doSignOut: function() {
      return fetch('/logout').then(() => {
        self.elements.userInfo.fadeOut(200);
        self.elements.pixelCounts.fadeOut(200);
        self.elements.userMessage.fadeOut(200);
        self.elements.loginOverlay.fadeIn(200);
        if (window.deInitAdmin) {
          window.deInitAdmin();
        }
        self.loggedIn = false;
        $(window).trigger('pxls:user:loginState', [false]);
        socket.reconnectSocket();
      });
    },
    init: function(instaban) {
      self.instaban = instaban;
      self.elements.userMessage.hide();
      self.elements.signup.hide();
      self.elements.signup.find('input').keydown(function(evt) {
        evt.stopPropagation();
        if (evt.key === 'Enter' || evt.which === 13) {
          self.doSignup();
        }
      });
      self.elements.signup.find('#signup-button').click(self.doSignup);
      $.get('/users', data => {
        self.elements.users.text(data.count).fadeIn(200);
      }).fail(function(e) {
        console.error('Error fetching /users: ', e);
        self.elements.users.text(NaN).fadeIn(200);
      });
      self.elements.pixelCounts.hide();
      self.elements.userInfo.hide();
      self.elements.userInfo.find('.logout').click(function(evt) {
        evt.preventDefault();

        modal.show(modal.buildDom(
          crel('h2', { class: 'modal-title' }, __('Sign Out')),
          crel('div',
            crel('p', __('Are you sure you want to sign out?')),
            crel('div', { class: 'buttons' },
              crel('button', {
                class: 'dangerous-button text-button',
                onclick: () => self.doSignOut().then(() => modal.closeAll())
              }, __('Yes')),
              crel('button', {
                class: 'text-button',
                onclick: () => modal.closeAll()
              }, __('No'))
            )
          )
        ));
      });
      $(window).bind('storage', function(evt) {
        if (evt.originalEvent.key === 'auth') {
          ls.remove('auth');
          self.signin();
        }
      });
      socket.on('users', function(data) {
        self.elements.users.text(data.count);
      });
      socket.on('userinfo', function(data) {
        let isBanned = false;
        const banelem = crel('div', { class: 'ban-alert-content' });
        self.username = data.username;
        self.loggedIn = true;
        self.pixelCount = data.pixelCount;
        self.pixelCountAllTime = data.pixelCountAllTime;
        self.updatePixelCountElements();
        self.elements.pixelCounts.fadeIn(200);
        self.placementOverrides = data.placementOverrides;
        place.togglePaletteSpecialColors(data.placementOverrides.canPlaceAnyColor);
        self.chatNameColor = data.chatNameColor;
        chat.updateSelectedNameColor(data.chatNameColor);
        self.roles = data.roles;
        $(window).trigger('pxls:user:loginState', [true]);
        self.renameRequested = data.renameRequested;
        self.elements.loginOverlay.fadeOut(200);
        self.elements.userInfo.find('span#username').html(crel('a', {
          href: `/profile/${data.username}`,
          target: '_blank',
          title: __('My Profile')
        }, data.username).outerHTML);
        if (data.method === 'ip') {
          self.elements.userInfo.hide();
        } else {
          self.elements.userInfo.fadeIn(200);
        }

        if (data.banExpiry === 0) {
          isBanned = true;
          crel(banelem, crel('p', __('You are permanently banned.')));
        } else if (data.banned === true) {
          isBanned = true;
          const timestamp = new Date(data.banExpiry).toLocaleString();
          crel(banelem, crel('p', __(`You are temporarily banned and will not be allowed to place until ${timestamp}`)));
        } else if (self.isStaff()) {
          if (window.deInitAdmin) {
            window.deInitAdmin();
          }

          let scriptName = 'admin';

          const langcode = document.documentElement.lang;
          if (langcode !== 'en') {
            scriptName += '_' + langcode;
          }

          $.getScript(`admin/${scriptName}.js`).done(function() {
            window.initAdmin({
              socket: socket,
              user: user,
              modal: modal,
              lookup: lookup,
              chat: chat
            }, admin => { self.admin = admin; });
          });
        } else if (window.deInitAdmin) {
          window.deInitAdmin();
        }
        if (isBanned) {
          self.elements.userMessage.empty().show().text(__('You can contact us using one of the links in the info menu.')).fadeIn(200);
          crel(banelem,
            crel('p', __('If you think this was an error, please contact us using one of the links in the info tab.')),
            crel('p', __('Ban reason:')),
            crel('p', data.banReason)
          );
          modal.show(modal.buildDom(
            crel('h2', __('Banned')),
            banelem
          ), { escapeClose: false, clickClose: false });
          if (window.deInitAdmin) {
            window.deInitAdmin();
          }
        } else if (data.renameRequested) {
          self.showRenameRequest();
        } else {
          self.elements.userMessage.hide();
        }
        chat.updateCanvasBanState(isBanned);

        if (self.instaban) ban.shadow('App existed beforehand');

        analytics('send', 'event', 'Auth', 'Login', data.method);
      });
      socket.on('pixelCounts', function(data) {
        self.pixelCount = data.pixelCount;
        self.pixelCountAllTime = data.pixelCountAllTime;

        self.updatePixelCountElements();

        // For userscripts.
        $(window).trigger('pxls:pixelCounts:update', Object.assign({}, data));
      });
      socket.on('admin_placement_overrides', function(data) {
        self.placementOverrides = data.placementOverrides;
      });
      socket.on('rename', function(e) {
        if (e.requested === true) {
          self.showRenameRequest();
        } else {
          self.hideRenameRequest();
        }
      });
      socket.on('rename_success', e => {
        self.username = e.newName;
        self.elements.userInfo.find('#username > a').text(e.newName);
      });
    },
    _handleRenameSubmit: function(event) {
      event.preventDefault();
      const input = this.querySelector('.rename-input');
      const btn = this.querySelector('.rename-submit');
      const err = this.querySelector('.rename-error');
      if (!input || !input.value || !btn || !err) return console.error('Missing one or more variables from querySelector. input: %o, btn: %o, err: %o', input, btn, err);
      input.disabled = btn.disabled = true;
      $.post('/execNameChange', { newName: input.value.trim() }, function() {
        self.renameRequested = false;
        self.hideRenameRequest();
        modal.closeAll();
      }).fail(function(xhrObj) {
        let resp = __('An unknown error occurred. Please contact staff on discord');
        if (xhrObj.responseJSON) {
          resp = xhrObj.responseJSON.details || resp;
        } else if (xhrObj.responseText) {
          try {
            resp = JSON.parse(xhrObj.responseText).details;
          } catch (ignored) {
          }
        }
        err.style.display = null;
        err.innerHTML = resp;
      }).always(function() {
        input.disabled = btn.disabled = false;
      });
    },
    _handleRenameClick: function(event) {
      const renamePopup = crel('form', { onsubmit: self._handleRenameSubmit },
        crel('p', __('Staff have required you to change your username, this usually means your name breaks one of our rules.')),
        crel('p', __('If you disagree, please contact us on Discord (link in the info panel).')),
        crel('label', __('New Username:') + ' ',
          crel('input', {
            type: 'text',
            class: 'rename-input',
            required: 'true',
            onkeydown: e => e.stopPropagation()
          })
        ),
        crel('p', {
          style: 'display: none; font-weight: bold; color: #f00; font-size: .9rem;',
          class: 'rename-error'
        }, ''),
        crel('div', { style: 'text-align: right' },
          crel('button', { class: 'text-button', onclick: () => modal.closeAll() }, __('Not now')),
          crel('button', { class: 'rename-submit text-button', type: 'submit' }, __('Change'))
        )
      );
      modal.show(modal.buildDom(
        crel('h2', { class: 'modal-title' }, __('Rename Requested')),
        renamePopup
      ));
    },
    showRenameRequest: () => {
      self.elements.userMessage.empty().show().append(
        crel('span', __('You must change your username.') + ' ',
          crel('span', {
            style: 'cursor: pointer; text-decoration: underline;',
            onclick: self._handleRenameClick
          }, __('Click here to continue.'))
        )
      ).fadeIn(200);
    },
    hideRenameRequest: () => {
      self.elements.userMessage.fadeOut(200);
    },
    updatePixelCountElements: () => {
      self.elements.currentPixelCount.text(self.pixelCount.toLocaleString());
      self.elements.alltimePixelCount.text(self.pixelCountAllTime.toLocaleString());
    }
  };
  return {
    init: self.init,
    getRoles: self.getRoles,
    isStaff: self.isStaff,
    isDonator: self.isDonator,
    getPermissions: self.getPermissions,
    hasPermission: self.hasPermission,
    getUsername: self.getUsername,
    getPixelCount: self.getPixelCount,
    getPixelCountAllTime: self.getPixelCountAllTime,
    webinit: self.webinit,
    wsinit: self.wsinit,
    isLoggedIn: self.isLoggedIn,
    renameRequested: self.renameRequested,
    showRenameRequest: self.showRenameRequest,
    hideRenameRequest: self.hideRenameRequest,
    getChatNameColor: () => self.chatNameColor,
    setChatNameColor: c => { self.chatNameColor = c; },
    get admin() {
      return self.admin || false;
    },
    get placementOverrides() {
      return self.placementOverrides;
    }
  };
})();

module.exports.user = user;

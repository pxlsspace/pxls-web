const { settings } = require('./settings');
const { nativeNotifications } = require('./nativeNotifications');
const { uiHelper } = require('./uiHelper');
const { socket } = require('./socket');

/// Thanks to volcanofr for refactoring this file
/// and fixing most of timer-related bugs.

// this takes care of the countdown timer
module.exports.timer = (function() {
  const self = {

    /* DOM Elements */
    elements: {
      /** @type {JQuery} */
      palette: $('#palette'),
      /** @type {JQuery} */
      timer_container: $('#cooldown'),
      /** @type {JQuery} */
      timer_countdown: $('#cooldown-timer'),
      /** @type {JQuery} */
      timer_chat: $('#txtMobileChatCooldown')
    },

    /* Timer Variables */
    hasFiredNotification: true,
    cooldown: 0,
    audio: new Audio('notify.wav'),
    title: '',
    currentTimer: '',

    cooledDown: function() {
      return self.cooldown < (new Date()).getTime();
    },

    update: function() {
      /* Local variables */
      const alertDelay = settings.place.alert.delay.get();
      // subtract one extra millisecond to prevent the first displaying to be derped
      const delta = (self.cooldown - Date.now() - 1) / 1000;

      /* Old stuff */
      if (self.status) {
        console.warn('Timer: A vestige of the past wants to be reused. Note that \'timer.self.status\' is not supported anymore.');
        // self.elements.timer_countdown.text(self.status);
      }

      /* Visible timer */
      if (delta > 0) {
        const secs = Math.floor(Math.ceil(delta) % 60);
        const mins = Math.floor(Math.ceil(delta) / 60);
        self.currentTimer = mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');

        self.elements.timer_countdown.text(self.currentTimer);
        self.elements.timer_chat.text(self.currentTimer);
        self.elements.timer_container.show();
      } else {
        self.currentTimer = '';

        self.elements.timer_container.hide();
        self.elements.timer_countdown.text(self.currentTimer);
        self.elements.timer_chat.text(self.currentTimer);

        // Placeable from 2 are updated at:
        // * https://github.com/pxlsspace/pxls-web/blob/f51c7266fbec2ba98d60f6e6e68c75bba18b159d/public/include/uiHelper.js#L438-L440
        // on the following code:
        // * socket.on('pixels', [...]);
      }

      if (document.title !== uiHelper.getTitle()) {
        document.title = uiHelper.getTitle();
      }

      /* Notification */
      if (delta > 0 && alertDelay < delta) {
        self.hasFiredNotification = false;
      }

      if (!self.hasFiredNotification) {
        /** @param {string} text */
        const fireNotification = (text) => {
          self.playAudio();

          if (!document.hasFocus()) {
            const notif = nativeNotifications.maybeShow(__(text));

            if (notif) {
              $(window).one('pxls:ack:place', () => notif.close());
            }
          }
        };

        if (alertDelay < 0 && delta < Math.abs(alertDelay)) {
          self.hasFiredNotification = true;
          fireNotification(`Your next pixel will be available in ${Math.round(Math.abs(alertDelay) * 10) / 10} seconds!`);
          setTimeout(() => uiHelper.setPlaceableText(1), Math.abs(alertDelay) * 1000);
        } else if (alertDelay > 0 && delta <= 0) {
          self.hasFiredNotification = true;
          uiHelper.setPlaceableText(1);
          setTimeout(() => fireNotification(`Your next pixel has been available for ${Math.round(alertDelay * 10) / 10} seconds!`), alertDelay * 1000);
        } else if (delta <= 0) {
          self.hasFiredNotification = true;
          uiHelper.setPlaceableText(1);
          fireNotification('Your next pixel is available!');
        }
      }

      /* Continue updating? */
      if (!self.hasFiredNotification) {
        setTimeout(() => self.update(true), 1000);
      }
    },

    init: function() {
      self.title = document.title;

      self.elements.timer_container.hide();
      self.elements.timer_countdown.text(self.currentTimer);
      self.elements.timer_chat.text(self.currentTimer);

      setTimeout(function() {
        if (self.cooledDown() && uiHelper.getAvailable() === 0) {
          uiHelper.setPlaceableText(1);
        }
      }, 250);

      socket.on('cooldown', function(data) {
        self.cooldown = (new Date()).getTime() + (data.wait * 1000);
        self.hasFiredNotification = data.wait === 0;
        self.update();
      });
    },

    playAudio: function() {
      if (uiHelper.tabHasFocus() && settings.audio.enable.get()) {
        self.audio.play();
      }
    },

    getCurrentTimer: function() {
      return self.currentTimer;
    }
  };

  return {
    init: self.init,
    cooledDown: self.cooledDown,
    playAudio: self.playAudio,
    getCurrentTimer: self.getCurrentTimer,
    audioElem: self.audio
  };
})();

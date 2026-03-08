const smpp = require('smpp');
const gsm = require('gsm');
const _ = require('lodash');
const winston = require('winston');

class Session {
  constructor(provider, config) {
    this.provider = provider;
    this.host = config.ip;
    this.system_type = config.system_type;
    this.port = config.port;
    this.user = config.system_id;
    this.password = config.password;
    this.type = config.type;
    this.connected = false;
    this._reconnect = 0;
    this.is_tx = false;
    this.lastEnquireLinkTime = Date.now();
    this.session = new smpp.Session({
      host: this.host,
      port: this.port,
      auto_enquire_link_period: 29000,
      debug: false,
      reconnectTimeout: 5000, // Wait 5 seconds before reconnecting
      connectTimeout: 10000   // Connection timeout of 10 seconds
    });

    this.Watcher();
  }

  InjectSMSHandler(func) {
    this.rx_sms = func;
  }

  HandleRX(pdu) {
    if (typeof this.rx_sms === 'function') this.rx_sms(pdu);
  }

  async safeSessionSend(pdu) {
    if (!this.connected) {
      console.log(this.provider + ': Attempted to send PDU while disconnected');
      return false;
    }

    try {
      await this.session.send(pdu);
      return true;
    } catch (error) {
      if (error.code === 'EPIPE') {
        console.log(this.provider + ': Connection lost (EPIPE), triggering reconnect...');
        this.connected = false;
        this.session.connect();
      } else {
        console.error(this.provider + ': Error sending PDU:', error);
      }
      return false;
    }
  }

  Watcher() {
    this.session.on('connect', () => {
      console.log(this.provider + ': ' + this.type + ' CONNECTED');
      this.connected = true;
      this._reconnect = 0;
      this.lastEnquireLinkTime = Date.now();
      
      switch (this.type) {
        case 'trx':
          {
            this.is_tx = true;
            this.session.bind_transceiver(
              {
                system_id: this.user,
                password: this.password,
                system_type: this.system_type
              },
              (pdu) => {
                this.pdu = pdu;
              }
            );
          }
          break;
        case 'tx':
          {
            this.is_tx = true;
            this.session.bind_transmitter(
              {
                system_id: this.user,
                password: this.password,
                system_type: this.system_type
              },
              (pdu) => {
                this.pdu = pdu;
              }
            );
          }
          break;
        case 'rx':
          {
            this.session.bind_receiver(
              {
                system_id: this.user,
                password: this.password,
                system_type: this.system_type
              },
              (pdu) => {
                this.pdu = pdu;
              }
            );
          }
          break;
      }
    });

    this.session.on('enquire_link', () => {
      const now = Date.now();
      // Only respond if we haven't sent an enquire_link in the last 5 seconds
      if (now - this.lastEnquireLinkTime > 5000) {
        this.lastEnquireLinkTime = now;
        try {
          if (this.pdu && this.connected) {
            this.safeSessionSend(this.pdu.response());
          }
        } catch (e) {
          console.log(this.provider + ': Error handling enquire_link:', e);
          if (e.code === 'EPIPE') {
            this.connected = false;
            this.session.connect();
          }
        }
      }
    });

    this.session.on('pdu', (pdu) => {
      this.pdu = pdu;
    });

    // Remove receive functionality since we only want transmit
    // this.session.on('deliver_sm', (pdu) => {
    //   this.HandleRX(pdu);
    // });

    this.session.on('close', () => {
      console.log(this.provider + ': ' + this.type + ' CONNECTION CLOSED');
      this.connected = false;

      if (this._reconnect < 3) {
        this._reconnect++;
        const backoffDelay = Math.min(1000 * Math.pow(2, this._reconnect), 10000); // Exponential backoff with max 10s
        console.log(this.provider + ': ' + this.type + ' RETRY RECONNECT in ' + backoffDelay + 'ms. Attempt: ' + this._reconnect);
        
        setTimeout(() => {
          if (!this.connected) {
            this.session.connect();
          }
        }, backoffDelay);
      } else {
        console.log(this.provider + ': ' + this.type + ' TOO MANY FAILURES. RESETTING SESSION...');
        
        // Destroy existing session and create a new one
        setTimeout(() => {
          this._reconnect = 0;
          this.session.removeAllListeners(); // Clean up event listeners
          this.session = new smpp.Session({
            host: this.host,
            port: this.port,
            auto_enquire_link_period: 29000,
            debug: false,
            reconnectTimeout: 5000,
            connectTimeout: 10000
          });
          this.Watcher(); // Reinitialize event listeners
          console.log(this.provider + ': ' + this.type + ' NEW SESSION CREATED');
          this.session.connect();
        }, 10000);
      }
    });

    this.session.on('error', (error) => {
      console.log(this.provider + ': ' + this.type + ' smpp error', error);
      this.connected = false;

      // Handle EPIPE specifically
      if (error.code === 'EPIPE') {
        console.log(this.provider + ': Connection lost (EPIPE), attempting immediate reconnect...');
        this.session.connect();
        return;
      }

      if (this._reconnect >= 3) {
        console.log(this.provider + ': RESETTING SESSION DUE TO ERRORS...');
        
        this.session.removeAllListeners();
        this.session = new smpp.Session({
          host: this.host,
          port: this.port,
          auto_enquire_link_period: 29000,
          debug: false,
          reconnectTimeout: 5000,
          connectTimeout: 10000
        });
        this.Watcher();
        this.session.connect();
      }
    });
  }

  Connected() {
    return this.connected;
  }

  Session() {
    return this.session;
  }
}

class Sms {
  constructor(provider, config) {
    this.provider = provider;
    this.multi = false;
    this.tx_index = null;
    this.rx_index = null;
    // Add message tracking with better configuration
    this.messageTracker = new Map();
    this.MESSAGE_EXPIRY = 300000; // 5 minutes in milliseconds
    this.MAX_RETRIES = 3;
    this.RETRY_TIMEOUT = 10000; // 10 seconds
    
    this.cleanupInterval = setInterval(() => this.cleanupMessageTracker(), 1800000);

    // Add logger with console transport
    this.logger = winston.createLogger({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/sms-dedup.log' }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(({ level, message, timestamp, ...metadata }) => {
              const meta = Object.keys(metadata).length ? 
                ` ${JSON.stringify(metadata)}` : '';
              return `${timestamp} [${this.provider}] ${level}: ${message}${meta}`;
            })
          )
        })
      ]
    });

    // Log initialization
    console.log(`[${this.provider}] Initializing SMS service...`);

    if (Array.isArray(config)) {
      this.session = [];
      this.multi = true;
      for (let i = 0; i < config.length; i++) {
        this.session.push(new Session(provider, config[i]));
        // Only handle transmit sessions since we don't want to receive
        if (config[i].type === 'tx' || config[i].type === 'trx') this.tx_index = i;
        // Remove rx_index since we don't want to receive
        // this.session[i].InjectSMSHandler(this.RxSMS.bind(this));
      }
    } else {
      this.session = new Session(provider, config);
      this.multi = false;
      // Remove SMS handler since we don't want to receive
      // this.session.InjectSMSHandler(this.RxSMS.bind(this));
    }
  }

  generateMessageKey(msg) {
    // Welcome messages should always get a unique key to bypass deduplication
    if (msg.isWelcomeMessage) {
      return `welcome_${msg.to}_${Date.now()}`;
    }
    // Regular messages get deduplicated
    return `${msg.to}_${msg.message}`;
  }

  isMessageInProgress(key) {
    const tracking = this.messageTracker.get(key);
    if (!tracking) return false;

    // Check if the tracking has expired
    if (Date.now() - tracking.timestamp > this.MESSAGE_EXPIRY) {
      console.log(`[${this.provider}] Message ${key} expired after ${this.MESSAGE_EXPIRY}ms`);
      this.messageTracker.delete(key);
      return false;
    }

    // Check if we've exceeded max retries
    if (tracking.attempts >= this.MAX_RETRIES) {
      console.log(`[${this.provider}] Message ${key} exceeded max retries (${this.MAX_RETRIES})`);
      this.logger.error('Max retries exceeded', {
        key,
        attempts: tracking.attempts,
        provider: this.provider
      });
      this.messageTracker.delete(key);
      return false;
    }

    return true;
  }

  trackMessage(key, msg) {
    const tracking = this.messageTracker.get(key) || {
      timestamp: Date.now(),
      attempts: 0,
      originalMessage: msg.message,
      to: msg.to
    };
    
    tracking.attempts += 1;
    tracking.lastAttempt = Date.now();
    
    this.messageTracker.set(key, tracking);
    
    console.log(`[${this.provider}] Tracking message to ${msg.to} (attempt ${tracking.attempts})`);
    this.logger.info('Message tracked', {
      key,
      attempt: tracking.attempts,
      provider: this.provider,
      to: msg.to
    });
    
    return tracking;
  }

  cleanupMessageTracker() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, value] of this.messageTracker.entries()) {
      if (now - value.timestamp > this.MESSAGE_EXPIRY || value.attempts >= this.MAX_RETRIES) {
        this.messageTracker.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[${this.provider}] Cleaned up ${cleaned} messages, ${this.messageTracker.size} remaining`);
      this.logger.info('Cleaned up message tracker', {
        cleaned,
        remaining: this.messageTracker.size,
        provider: this.provider
      });
    }
  }

  RxSMS(pdu) {
    console.log(`[${this.provider}] Received SMS:`, pdu);
    // Handle incoming SMS if needed
  }

  isConnected() {
    if (this.multi) {
      if (this.tx_index >= 0) return this.session[this.tx_index].Connected();
      return false;
    }
    return this.session.Connected();
  }

  GetTxSession() {
    if (this.multi) {
      if (this.tx_index >= 0) return this.session[this.tx_index].session;
      return {};
    }
    return this.session.session;
  }

  GetRxSession() {
    if (this.multi) {
      if (this.rx_index >= 0) return this.session[this.rx_index].session;
      return {};
    }
    return this.session.session;
  }

  Send(msg) {
    const messageKey = this.generateMessageKey(msg);

    // Check for duplicates but with better handling
    if (!msg.isWelcomeMessage && this.isMessageInProgress(messageKey)) {
      const tracking = this.messageTracker.get(messageKey);
      console.log(`[${this.provider}] Duplicate detected for ${msg.to} (${tracking.attempts} attempts, ${Date.now() - tracking.timestamp}ms old)`);
      this.logger.warn('Duplicate message detected', {
        key: messageKey,
        to: msg.to,
        attempts: tracking.attempts,
        timeSinceFirst: Date.now() - tracking.timestamp,
        provider: this.provider
      });
      
      // If message is still in progress but not too old, return as pending
      if (Date.now() - tracking.lastAttempt < this.RETRY_TIMEOUT) {
        return Promise.resolve({ success: false, error: 'in_progress' });
      }
    }

    if (!this.isConnected()) {
      console.log(`[${this.provider}] Not connected, cannot send message to ${msg.to}`);
      return Promise.resolve({ success: false, error: 'not_connected' });
    }

    // Track this attempt (with special handling for welcome messages)
    const tracking = msg.isWelcomeMessage ? null : this.trackMessage(messageKey, msg);

    const original_sms = msg.message;
    msg.message = gsm(msg.message);

    let part_id = 0;
    var concat_ref = Math.floor(Math.random() * 255);
    let _timer;

    return new Promise((resolve) => {
      if (_.size(msg.message.parts) === 1) {
        console.log(`[${this.provider}] Sending ${msg.isWelcomeMessage ? 'welcome' : 'regular'} message to ${msg.to}`);
        var submit_pdu = {
          destination_addr: msg.to,
          short_message: original_sms,
          source_addr: '11012',
          registered_delivery: 0
        };

        const timeout = msg.isWelcomeMessage ? 15000 : this.RETRY_TIMEOUT;

        _timer = setTimeout(() => {
          console.log(`[${this.provider}] Message to ${msg.to} timed out after ${timeout}ms`);
          if (!msg.isWelcomeMessage) {
            this.updateMessageAttempts(messageKey);
          }
          resolve({
            error: 'timeout',
            success: false
          });
        }, timeout);

        this.GetTxSession().submit_sm(submit_pdu, (pdu, er) => {
          clearTimeout(_timer);
          if (pdu.command_status == 0) {
            console.log(`[${this.provider}] Message to ${msg.to} sent successfully`);
            if (!msg.isWelcomeMessage) {
              this.messageTracker.delete(messageKey);
            }
            resolve({ 
              success: true, 
              status: 'sent'
            });
          } else {
            console.log(`[${this.provider}] Message to ${msg.to} failed with status ${pdu.command_status}`);
            if (!msg.isWelcomeMessage) {
              this.updateMessageAttempts(messageKey);
            }
            resolve({ 
              success: false,
              status: 'failed',
              error: `SMPP Error: ${pdu.command_status}`
            });
          }
        });
      } else {
        // Handle multipart messages
        console.log(`[${this.provider}] Sending ${msg.message.parts.length}-part message to ${msg.to}`);
        const totalParts = msg.message.parts.length;
        let completedParts = 0;
        let allSuccess = true;

        msg.message.parts.forEach((part, ix) => {
          part_id++;
          var udh = Buffer.alloc(6);
          udh.write(String.fromCharCode(0x5), 0);
          udh.write(String.fromCharCode(0x0), 1);
          udh.write(String.fromCharCode(0x3), 2);
          udh.write(String.fromCharCode(concat_ref), 3);
          udh.write(String.fromCharCode(msg.message.sms_count), 4);
          udh.write(String.fromCharCode(part_id), 5);

          var submit_pdu = {
            source_addr: '11012',
            destination_addr: msg.to,
            short_message: { udh: udh, message: part },
            registered_delivery: 0
          };

          this.GetTxSession().submit_sm(submit_pdu, (pdu, er) => {
            completedParts++;
            if (pdu.command_status !== 0) {
              allSuccess = false;
            }

            if (completedParts === totalParts) {
              if (allSuccess) {
                this.messageTracker.delete(messageKey);
                resolve({ success: true });
              } else {
                this.updateMessageAttempts(messageKey);
                resolve({ success: false });
              }
            }
          });
        });
      }
    }).finally(() => {
      clearTimeout(_timer);
    });
  }

  updateMessageAttempts(key) {
    const tracking = this.messageTracker.get(key);
    if (tracking) {
      tracking.attempts += 1;
      this.messageTracker.set(key, tracking);
    }
  }

  // Clean up when service is destroyed
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    console.log(`[${this.provider}] SMS service destroyed, cleanup complete`);
  }
}

class SMSManager {
  constructor(libyana, madar) {
    this.libyana = libyana;
    this.madar = madar;
    this.LIBYANA = ['21892', '21894','092','094'];
    this.MADAR = ['21891', '21893','091','093'];
  }

  Send(msg) {
    if (this.LIBYANA.some((i) => String(msg.to).startsWith(i))) return this.libyana.Send(msg);
    if (this.MADAR.some((i) => String(msg.to).startsWith(i))) return this.madar.Send(msg);
    return Promise.resolve({ success: false, error: 'invalid_number' });
  }
}

module.exports = { Session, Sms, SMSManager }; 
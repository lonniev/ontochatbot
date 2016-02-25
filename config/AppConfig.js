'use strict';

const _ = require('lodash');

const AppConfig = {
  clientId: process.env.GITTER_APP_KEY,
  token: process.env.GITTER_USER_TOKEN,
  apiKey: process.env.FCC_API_KEY,
  supportDmRooms: false,
  botname: null,
  roomId: '55b1a9030fc9f982beaac901',
  org: 'bothelp',
  testUser: 'bothelp',
  // so bot doesnt get in a loop replying itself
  botlist: ['bothelp', 'camperbot', 'ontochatbot', 'demobot'],
  webuser: 'webuser',
  wikiHost: 'https://github.com/freecodecamp/freecodecamp/wiki/',
  gitterHost: 'https://gitter.im/',
  botVersion: '0.0.12',
  MAX_WIKI_LINES: 20,
  botNoiseLevel: 1,

  init: function() {
    const serverEnv = process.env.SERVER_ENV;
    AppConfig.serverEnv = serverEnv;
    this.warn('AppConfig.init serverEnv:', serverEnv);

    const thisConfig = envConfigs[serverEnv];
    if (!thisConfig) {
      const msg = ('FATAL ERROR! cant find serverEnv: ' + serverEnv);
      console.error(msg);
      throw new Error(msg);
    }
    _.merge(AppConfig, thisConfig);
  },

  showConfig: function() {
    console.log('AppConfig');
    Object.keys(AppConfig)
    .sort()
    .forEach(v => {
      if (typeof AppConfig[v] !== 'function') {
        console.log('\t', v, ':\t\t', AppConfig[v]);
      }
    });
  },

  warn: function(msg, obj) {
    console.warn('WARN> AppConfig', msg, obj);
  },

  // TODO cleanup
  // use as a function so it can be set at startup
  // before other code calls it at runtime
  getBotName: function() {
    if (!AppConfig.botname) {
      AppConfig.init();
      this.warn('getBotName()', AppConfig.botname );
      console.log('tried to call botname before it was set');
    }
    return AppConfig.botname;
  },

  who: function(req) {
    let who;

    if (req.user) {
      console.warn('got a user in the request but ignoring');
    } else if (req.who) {
      who = req.who;
    } else {
      who = AppConfig.webuser;
    }
    return who;
  },

  // TODO read from config file for dev/live modes and running env
  getOrg: function() {
    return AppConfig.org;
  },

  topicDmUri: function(topic) {
    let uri = AppConfig.appHost + '/go?dm=y&room=' + AppConfig.getBotName();
    if (topic) {
        uri += '&topic=' + topic;
    }
    return uri;
  },

  dmLink: function() {
    return 'https://gitter.im/' + AppConfig.getBotName();
  }
};

const envConfigs = {

  // replace this with your own ID
  ontochatbot: {
    botname: 'ontochatbot',
    appHost: "http://localhost:7000",
    apiServer: "freecodecamp.com",
    appRedirectUrl: "http://localhost:7891/login/callback",
  },

  demobot: {
    botname: 'demobot',
    appHost: 'http://localhost:7000',
    apiServer: 'www.freecodecamp.com',
    appRedirectUrl: 'http://localhost:7891/login/callback'
  },

  test: {
    botname: 'bothelp',
    appHost: 'http://localhost:7000',
    apiServer: 'www.freecodecamp.com',
    appRedirectUrl: 'http://localhost:7891/login/callback'
  },

  local: {
    botname: 'bothelp',
    appHost: 'http://localhost:7000',
    apiServer: 'www.freecodecamp.com',
    appRedirectUrl: 'http://localhost:7891/login/callback'
  },
  
  beta: {
    botname: 'bothelp',
    appHost: 'http://localhost:7000',
    apiServer: 'beta.freecodecamp.com',
    appRedirectUrl: 'http://localhost:7891/login/callback'
  },
  
  prod: {
    botname: 'camperbot',
    appHost: 'http://bot.freecodecamp.com',
    apiServer: 'www.freecodecamp.com',
    appRedirectUrl: 'http://bot.freecodecamp.com/login/callback'
  }
};

AppConfig.init();

module.exports = AppConfig;

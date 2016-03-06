'use strict';

const AppConfig = require('../../config/AppConfig'),
      Rooms = require('../../lib/app/Rooms.js'),
      Utils = require('../../lib/utils/Utils'),
      Bonfires = require('./Bonfires'),
      RoomData = require('../../data/RoomData'),
      GitterHelper = require('../../lib/gitter/GitterHelper');

const Firebase = require("firebase");

const CryptoJS = require("crypto-js");

function clog(msg, obj) {
  Utils.clog('Routes>', msg, obj);
}

const Router = {
  // query can include a room or a topic
  findRedirect: function(query) {
    Utils.isObject(query);
    query.org = AppConfig.getOrg();

    if (query.dm === 'y') {
      query.room = query.room || AppConfig.getBotName();
    }

    if (query.room) {
      // need to make a roomObj for other handling
      query.roomObj = {
        title: query.room,
        name: query.room
      };
    } else if (query.topic) {
      query.roomObj = Rooms.findByTopic(query.topic);
    }
    Utils.isObject(query.roomObj, 'could not find room object');
    query.url = 'https://gitter.im/' + query.roomObj.name;
    clog('findRedirect:', query);
    return query;
  },

  init: function(app, gbot, passport) {
    Router.gbot = gbot;
    const that = this;

    app.get('/test', (req, res) => {
      res.send('test');
    });

    app.get('/go', (req, res) => {
      const redir = that.findRedirect(req.query);
      gbot.announce(redir);
      res.redirect(redir.url);
    });

    app.get('/api/v1/msg', (req, res) => {
      const redir = that.findRedirect(req.query);
      gbot.announce(redir);
      res.send('OK');
    });

    app.get('/login', passport.authenticate('oauth2'));

    app.get('/login/callback',
      passport.authenticate('oauth2', {
        successRedirect: '/home',
        failureRedirect: '/'
      })
    );

    app.get('/logout', (req, res) => {
      req.session.destroy();
      res.redirect('/');
    });

    app.get('/', (req, res) => {
      res.render('landing');
    });

    // after login home show token
    app.get('/home2', (req, res) => {
      if (!req.user) {
        return res.redirect('/');
      }

      res.render('home', {
        user: req.user,
        sessionToken: req.session.token,
        rooms: []
      });
    });


    app.get('/rooms', (req, res) => {
      // for now force login so we dont get webspammed by crawlers
      if (!req.user) {
        return res.redirect('/');
      }
      console.log('req.user', req.user);

      const rooms = RoomData.rooms('camperbot').filter(rm => {
        return rm.isBonfire;
      });
      console.log(rooms);

      res.render('rooms', {
        user: req.user,
        who: AppConfig.who(req),
        token: req.session.token,
        rooms: rooms,
        bonfires: Bonfires.data.challenges,
        topicDmUri: AppConfig.topicDmUri()
      });
    });

    app.get('/rooms/update', (req, res) => {
      Router.gbot.scanRooms(req.user, req.session.token);
      res.redirect('/home');
    });

    app.get('/home', (req, res) => {
      if (!req.user) {
        return res.redirect('/');
      }

      GitterHelper.fetchRooms(req.user, req.session.token, (err, rooms) => {
        if (err) {
          return res.send(500);
        }
        const blob = {
          user: req.user,
          token: req.session.token,
          rooms: rooms,
          topicDmUri: AppConfig.topicDmUri()
        };
        clog('rooms.blob', blob);
        res.render('home', blob);
      });
    });

    app.post( '/firebase/trust',
      ( req, res ) =>
      {
        const firebaseRef = new Firebase( process.env.FIREBASE_REF );

        // have them authenticate with github
        new Promise(
        ( resolve, reject ) =>
        {
            firebaseRef.authWithOAuthPopup( "github",
              ( err, user ) =>
              {
                return ( err )
                  ? reject( err )
                  : resolve( user );
              },
              
              { scope: "user,gist,repo" }
            )
            .then(
              user =>
              {
                const userRef = firebaseRef.child( 'users' ).child( user.uid );
                
                const authData = userRef.getAuth();
                
                const userHash = CryptoJS.AES.encrypt( authData.github.username,
                  process.env.FIREBASE_SEED );
                const tokenHash = CryptoJS.AES.encrypt( authData.github.accessToken,
                  process.env.FIREBASE_SEED );
                
                userRef.set( { gitter: { user: userHash, access: tokenHash } },
                  function onComplete()
                  {
                    res.status( 200 ).send('OK');
                  }
                );
              }
            )
            .catch(
              err =>
              {
                // some inability to authenticate or gain the user's trust
                console.log( err );
                res.status( 401 ).send( err );
              }
            );
          }
        );
      }
    );
    
    app.get( '/firebase',
      (req, res) =>
      {
        res.render( 'firebase', {} );
      }
    );
    
    // Alive Status - returns 200/OK on GET
    app.get('/status', (req, res) => {
      // To disable etag/cache/304 response
      req.method = 'NONE';
      res.status(200).send('OK');
    });
  }
};

module.exports = Router;

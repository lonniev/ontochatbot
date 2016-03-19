'use strict';

// Firebase provides cloud storage and user authentication
const Firebase = require("firebase");

// CryptoJS provides encryption utilities
const CryptoJS = require("crypto-js");

// GitHubApi provides a JavaScript methods API to the GitHub REST API
const GitHubApi = require("github4");

// PEGjs provides Parsing Expression Grammar for natural language parsing
require( 'pegjs-require' );

const pluralize = require( 'pluralize' );
const spell = require('spell-it')('en');

// let's build a little parser for a little github DSL
var parser = require('./github_grammar.js')

// get a reference to OntoChatBot's backend services
var firebaseRef = new Firebase( process.env.FIREBASE_REF );

var github = new GitHubApi(
  {
    protocol: "https",
    host: "api.github.com", // should be api.github.com for GitHub
    timeout: 5000,
    headers: {
        "user-agent": "ontochatbot" // GitHub is happy with a unique user agent
    }
  }
);

const aesEncrypt = function( plaintext )
{
  const key = CryptoJS.enc.Base64.parse( process.env.FIREBASE_KEY );
  const iv  = CryptoJS.enc.Base64.parse( process.env.FIREBASE_VECTOR );

  return CryptoJS.AES.encrypt( plaintext, key, {iv: iv} )
    .ciphertext
    .toString( CryptoJS.enc.Base64 );
}
    
const aesDecrypt = function( cipher )
{
  const key = CryptoJS.enc.Base64.parse( process.env.FIREBASE_KEY );
  const iv  = CryptoJS.enc.Base64.parse( process.env.FIREBASE_VECTOR );

  return CryptoJS.AES.decrypt( cipher, key, {iv: iv} )
    .toString( CryptoJS.enc.Utf8 );
}


// find a firebase user given the gitter username
// returns a Promise that will resolve to a user entry or to falsey
const getUserByGitterName = function( usersDb, gitterName )
{
  const aPromisedUser = new Promise(
    (resolve, reject) =>
    {
      usersDb.once( 'value',
        users =>
        {
          users.forEach(
            aUserSnap =>
            {
              if ( aUserSnap.hasChild( "someService/user" ) )
              {
                const namePlain = aesDecrypt(
                  aUserSnap.child( "someService/user" ).val() );
                
                if ( namePlain == gitterName )
                {
                  // this truthy value ends the iteration
                  resolve( aUserSnap.val() );
                  return true;
                }
              }
            }
          );
      
          reject( "No Firebase user found for " + gitterName );
        }
      );
    }
  );
  
  return aPromisedUser;
}

// return a Promise that resolves to a user if any
// for interacting with GitHub
const findFirebaseUser = function( username )
{
  // try to use the Firebase service
  const authPromise = firebaseRef.authWithCustomToken(
    process.env.FIREBASE_SECRET,
    ( error, authData ) =>
    {
      if (error)
      {
        console.log("Authentication Failed!", error);
      }
    }
  );
  
  return authPromise
    .then(
      authData =>
      {
        // return a promise for a found github user
        return getUserByGitterName(
          firebaseRef.child( 'users' ), username );
      }
    )
    .catch(
      reason =>
      {
        console.log( reason );
        
        // unable to reference firebase, indicate no found user
        return Promise.reject( "Unable to authenticate with Firebase" );
      }
    );
}

const new_issue = function( data, bot, username, room )
{
  const repoUser = room.name.split('/')[0];
  const repo = room.name.split('/')[1];

  findFirebaseUser( username )
  .then( user =>
    {
      const accessPlain = aesDecrypt(
        user.someService.access );
      
      const accessMeans = {
        type: "oauth",
        token: accessPlain
      };
  
      github.authenticate( accessMeans );
  
      data.repo = repo;
      data.user = repoUser;
    
      github.issues.create(
        data,
        ( err, jsondata ) =>
        {
          var msg = "Something unexpected happened."
          
          if ( err && err.code == 404 )
          {
            msg = "Hey, @" + username + ", can your check credentials?"
              +" GitHub says it can't post a new issue.";
          }
          if ( err && err.code == 401 )
          {
            msg = "Oops, @" + username + ", your Firebase credentials are outdated."
              + " GitHub says I can't post a new issue for you.";
          }
          if ( err && err.code == 422 )
          {
            msg = "Hmm. GitHub says your issue assignee is not legitimate. Check that for us."
          }
          else if ( jsondata )
          {
            msg = "no problem @" + username + ", I created issue #"
              + jsondata.number + " for you.";
          }
          
          bot.say( msg, room );
                           
          if ( err ) console.log( err );
        }
      );
    }
  )
  .catch(
    rejection =>
    {
      console.log( rejection );
      
      bot.say( "@" + username + ", you haven't granted me permission to create issues on "
        + "your behalf. Please visit http://j.mp/ontochatbot to tell me you trust me. Then try asking me again.", room );
    }
  );
}

const close_issue = function( data, bot, username, room )
{
  const repoUser = room.name.split('/')[0];
  const repo = room.name.split('/')[1];
    
  findFirebaseUser( username )
  .then(
    user =>
    {
      const accessPlain = aesDecrypt(
        user.someService.access );
      
      const accessMeans = {
        type: "oauth",
        token: accessPlain
      };
  
      github.authenticate( accessMeans );
    
      github.issues.edit(
    
        { "user": repoUser, "repo": repo, "number": data.issue, "state": "closed" },
      
        ( err, jsondata ) =>
        {
          var msg = "Hmm. Something unexpected happened.";
        
          if ( err && err.code == 404 )
          {
            msg = "Hey, @" + username + ", can you check that issue number?"
              +" GitHub says it can't find issue #" + data.issue + ".";
          }
          else if ( jsondata )
          {
            msg = "Sure thing, @" + username + ", I closed issue #"
              + jsondata.number + " for you.";
          }
        
          bot.say( msg, room );
        }
      );
    }
  )
  .catch(
    rejection =>
    {
      console.log( rejection );
      
      bot.say( "@" + username + ", you haven't granted me permission to close issues on "
        + "your behalf. Please visit http://j.mp/ontochatbot to tell me you trust me. Then try asking me again.", room );
    }
  );
}

const search_issues = function( data, bot, username, room )
{
  const fromJsonToItem = function( elem, index, all )
  {
    return {
      "issue": elem.number,
      "title": elem.title,
      "state": elem.state,
      "modified": elem.updated_at
    };
  };
    
  const fromItemToMarkdown = function( elem, index, all )
  {
    return " - #" + elem.issue
      + " \"" + elem.title + "\""
      + " (" + elem.state + ")"
      + " Modified: " + elem.modified;
  };
    
  github.search.issues(
  
    { "q": data.whereclause.concat( " repo:" ).concat( room.name ) },
    
    ( err, jsondata ) =>
    {
      if ( ! ( "items" in jsondata ) )
      {
        bot.say( "I really apologize, @" + username
          + ". I grok what you want but my peers let me down."
          + " You know, I might not have the right credentials...", room );
          
        return;
      }

      if ( jsondata.total_count == 0 )
      {
        bot.say( "@" + username + ", sorry, I found no issues for that query.", room );
          
        return;
      }
                
      var msg = "Here's what I found, @" + username
        + ", when I searched for you. There "
        + pluralize( "is", jsondata.total_count ) + " "
        + spell( jsondata.total_count ) + " "
        + pluralize( "issue", jsondata.total_count ) + ":\n\n";
        
      var report = jsondata.items.map( fromJsonToItem )
                    .map( fromItemToMarkdown )
                    .join( '\n' );
               
      bot.say( msg.concat( report ), room );
    }
  );
}

const comment_issue = function( data, bot, username, room )
{
  const repoUser = room.name.split('/')[0];
  const repo = room.name.split('/')[1];
    
  findFirebaseUser( username )
  .then(
    user =>
    {
      const accessPlain = aesDecrypt(
        user.someService.access );
      
      const accessMeans = {
        type: "oauth",
        token: accessPlain
      };
  
      github.authenticate( accessMeans );
    
      github.issues.createComment(
      
        { "user": repoUser, "repo": repo, "number": data.issue, "body": data.body },
        
        ( err, jsondata ) =>
        {
          var msg = "Hmm. Something unexpected happened.";
        
          if ( err && err.code == 404 )
          {
            msg = "Hey, @" + username + ", can you check that issue number?"
              +" GitHub says it can't find issue #" + data.issue + ".";
          }
          else if ( err && err.code == 400 )
          {
            msg = "Oops, @" + username + ", my PEG is giving me bad JSON.";
          }
          else
          {
            msg = "Sure thing, @" + username + ", I added your comment to issue #"
              + data.issue + " for you.";
          }
        
          bot.say( msg, room );
        }
      );
    }
  )
  .catch(
    rejection =>
    {
      console.log( rejection );
      
      bot.say( "@" + username + ", you haven't granted me permission to comment on issues on "
        + "your behalf. Please visit http://j.mp/ontochatbot to tell me you trust me. Then try asking me again.", room );
    }
  );
}

const github_request = {
  "new_issue": new_issue,
  "close_issue": close_issue,
  "search_issues": search_issues,
  "comment_issue": comment_issue
};

const githubCommands =
{
  github: function( input, bot )
  {
    const username = input.message.model.fromUser.username;
    const plaintext = input.message.model.text;
    const room = input.message.room;
    
    try
    {
      var request = parser.parse( plaintext );
    }
    catch (parseException)
    {
      bot.say( "It's not you, it's me, @" + username
        + ". I just couldn't parse what you asked me.\n\n"
        + parseException.message, room )
      
      return;
    }
    
    try
    {
      github_request[request.method]( request.data, bot, username, room );
    }
    catch (restException)
    {
      console.log( restException );
      
      bot.say( "I really apologize, @" + username
        + ". I grok what you want but my peers let me down."
        + " You know, I might not have the right credentials...", room );
    }
  }
};

module.exports = githubCommands;

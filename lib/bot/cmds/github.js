'use strict';

// Firebase provides cloud storage and user authentication
const Firebase = require("firebase");

// GitHubApi provides a JavaScript methods API to the GitHub REST API
const GitHubApi = require("github4");

// PEGjs provides Parsing Expression Grammar for natural language parsing
require( 'pegjs-require' );

const pluralize = require( 'pluralize' );
const spell = require('spell-it')('en');

// let's build a little parser for a little github DSL
var parser = require('./github_grammar.js')

// get a reference to OntoChatBot's backend services
var firebaseRef = new Firebase("https://glaring-inferno-2964.firebaseio.com/");

var github = new GitHubApi({
    // optional
    debug: true,
    protocol: "https",
    host: "api.github.com", // should be api.github.com for GitHub
    timeout: 5000,
    headers: {
        "user-agent": "ontochatbot" // GitHub is happy with a unique user agent
    }
});

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
              if ( aUserSnap.hasChild( "github/username" )
                && ( gitterName == aUserSnap.child( "github/username" ).val() ) )
              {
                // this truthy value ends the iteration
                resolve( aUserSnap.val() );
                return true;
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
      else
      {
        console.log("Authenticated successfully with payload:", authData );
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
      const accessMeans = {
        type: "oauth",
        token: user.github.accessToken
      };
  
      console.log( accessMeans );
  
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
          else if ( jsondata )
          {
            msg = "no problem @" + username + ", I created issue #"
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
      bot.say( "@" + username + ", you haven't granted me permission to act on "
        + "your behalf. Please visit firebase to tell me you trust me.", room );
    }
  );
}

const close_issue = function( data, bot, username, room )
  {
    const repoUser = room.name.split('/')[0];
    const repo = room.name.split('/')[1];
    
    github.authenticate(
      { type: "basic",
        username: "ontochatbot",
        password: "predictable2015" }
    );
    
    github.issues.edit(
      { "user": repoUser, "repo": repo, "number": data.issue, "state": "closed" },
      function ( err, jsondata )
      {
        var msg = "Hmm. Something unexpected happened.";
        
        if ( err && err.code == 404 )
        {
          msg = "Hey, @" + username + ", can you check that issue number?"
            +" GitHub says it can't find issue #" + data.issue + ".";
        }
        else
        if ( jsondata )
        {
          msg = "Sure thing, @" + username + ", I closed issue #"
            + jsondata.number + " for you.";
        }
        
        console.log( jsondata );
          
        bot.say( msg, room );
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
      function ( err, jsondata )
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
    
    github.authenticate(
      { type: "basic",
        username: "ontochatbot",
        password: "predictable2015" }
    );
    
    github.issues.createComment(
      { "user": repoUser, "repo": repo, "number": data.issue, "body": data.body },
      function ( err, jsondata )
      {
        var msg = "Hmm. Something unexpected happened.";
        
        if ( err && err.code == 404 )
        {
          msg = "Hey, @" + username + ", can you check that issue number?"
            +" GitHub says it can't find issue #" + data.issue + ".";
        }
        else
        if ( err && err.code == 400 )
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

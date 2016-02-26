'use strict';

require( 'pegjs-require' );

const pluralize = require( 'pluralize' );
const spell = require('spell-it')('en');

const Client = require('node-rest-client').Client;

// let's build a little parser for a little github DSL
var parser = require('./github_grammar.js')

var githubber = new Client();

// register several REST methods
githubber.registerMethod( "new_issue",
  "https://api.github.com/repos/API4KBs/api4kbs/issues", "POST" );

githubber.registerMethod( "close_issue",
  "https://api.github.com/repos/API4KBs/api4kbs/issues/${issue}", "PATCH" );

githubber.registerMethod( "search_issues",
  "https://api.github.com/search/issues", "GET" );

githubber.registerMethod( "comment_issue",
  "https://api.github.com/repos/API4KBs/api4kbs/issues/${issue}/comments", "POST" );

const new_issue = function( data, bot, username, room )
  {
    var args =
    {
      data: data,

      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': 'Basic '
          + process.env.ONTOCHATBOT_AUTH_CODE,
        'user-agent': 'ontochatbot'
      }
    };

    githubber.methods.new_issue( args,
      function ( jsondata, response )
      {
        var msg = "no problem @" + username + ", I created issue #"
          + jsondata.number + " for you.";
          
        bot.say( msg, room );
      }
    );
  }

const close_issue = function( data, bot, username, room )
  {
    var args =
    {
      path: {
        "issue": data.issue
      },
      
      data: {
        "state": "closed"
      },

      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': 'Basic '
          + process.env.ONTOCHATBOT_AUTH_CODE,
        'user-agent': 'ontochatbot'
      }
    };

    githubber.methods.close_issue( args,
      function ( jsondata, response )
      {
        var msg = "Hmm. Something unexpected happened and returned Status "
          + response.statusCode;
        
        if ( response.statusCode == 200 )
        {
          msg = "Sure thing, @" + username + ", I closed issue #"
            + jsondata.number + " for you.";
        }
        
        if ( response.statusCode == 404 )
        {
          msg = "Hey, @" + username + ", can you check that issue number?"
            +" GitHub says it can't find issue #" + data.issue + ".";
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
    
    var args =
    {
      parameters: {
        "q": data.whereclause.concat( " repo:" ).concat( room.name )
      },
      
      headers: {
        'content-type': 'application/json',
        'authorization': 'Basic '
          + process.env.ONTOCHATBOT_AUTH_CODE,
        'user-agent': 'ontochatbot'
      }
    };

    console.log( args.parameters.q );

    githubber.methods.search_issues( args,
      function ( jsondata, response )
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
    var args =
    {
      path: {
        "issue": data.issue
      },
      
      data: { "body": data.body },

      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': 'Basic '
          + process.env.ONTOCHATBOT_AUTH_CODE,
        'user-agent': 'ontochatbot'
      }
    };

    githubber.methods.comment_issue( args,
      function ( jsondata, response )
      {
        var msg = "Hmm. Something unexpected happened and returned Status "
          + response.statusCode;
        
        if ( response.statusCode == 201 )
        {
          msg = "Sure thing, @" + username + ", I added your comment to issue #"
            + data.issue + " for you.";
        }
        
        if ( response.statusCode == 404 )
        {
          msg = "Hey, @" + username + ", can you check that issue number?"
            +" GitHub says it can't find issue #" + data.issue + ".";
        }
        
        if ( response.statusCode == 400 )
        {
          msg = "Oops, @" + username + ", my PEG is giving me bad JSON.";
        }
        
        console.log( jsondata );
          
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
      
      console.log( parseException );
      
      return;
    }
    
    try
    {
      github_request[request.method]( request.data, bot, username, room );
    }
    catch (restException)
    {
      bot.say( "I really apologize, @" + username
        + ". I grok what you want but my peers let me down."
        + " You know, I might not have the right credentials...", room );
    }
  }
};

module.exports = githubCommands;

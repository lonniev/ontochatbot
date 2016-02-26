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
        var msg = "Sure thing, @" + username + ", I closed issue #"
          + jsondata.number + " for you.";
          
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
        if ( ! ( "items" in jsondata ) || ( jsondata.total_count == 0 ) )
        {
          bot.say( "@" + username + ", I probably misunderstood you because I found no matches for that query.", room );
          
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

const github_request = {
  "new_issue": new_issue,
  "close_issue": close_issue,
  "search_issues": search_issues
};

const githubCommands =
{
  github: function( input, bot )
  {
    const username = input.message.model.fromUser.username;
    const plaintext = input.message.model.text;
    const room = input.message.room;
    
    var request = parser.parse( plaintext );
    
    github_request[request.method]( request.data, bot, username, room );
  }
};

module.exports = githubCommands;

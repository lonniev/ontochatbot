'use strict';

require('pegjs-require');

const Client = require('node-rest-client').Client;

// let's build a little parser for a little github DSL
var parser = require('./github_grammar.js')

var githubber = new Client();

// register several REST methods
githubber.registerMethod( "new_issue",
  "https://api.github.com/repos/API4KBs/api4kbs/issues", "POST" );

githubber.registerMethod( "close_issue",
  "https://api.github.com/repos/API4KBs/api4kbs/issues/${issue}", "PATCH" );

const new_issue = function( data, bot, username, room )
  {
    var args =
    {
      data: data,

      headers: {
        'cache-control': 'no-cache',
        'content-type': 'application/json',
        'authorization': 'Basic bG9ubmlldjozMmdldFJlYWR5IQ==',
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
        'authorization': 'Basic bG9ubmlldjozMmdldFJlYWR5IQ==',
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

const github_request = {
  "new_issue": new_issue,
  "close_issue": close_issue
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

var cfenv = require('cfenv');
var cloudant = require('cloudant');
var dotenv = require('dotenv');
var express = require('express');
var CloudantRecipeStore = require('./CloudantRecipeStore');
var SousChef = require('./SousChef');

var app = express();

app.use(express.static(__dirname + '/public'));

(function() {
    // load environment variables
    dotenv.config();
    var cloudantClient = cloudant({
        url: process.env.CLOUDANT_URL,
        plugin:'promises'
    });
    // start the souschef bot
    var sousChef = new SousChef(
        new CloudantRecipeStore(cloudantClient, process.env.CLOUDANT_DB_NAME),
        process.env.SLACK_BOT_TOKEN,
        process.env.SPOONACULAR_KEY,
        process.env.CONVERSATION_USERNAME,
        process.env.CONVERSATION_PASSWORD,
        process.env.CONVERSATION_WORKSPACE_ID
    );
    sousChef.run();
})();

// get the app environment from Cloud Foundry
var appEnv = cfenv.getAppEnv();

// start server on the specified port and binding host
app.listen(appEnv.port, '0.0.0.0', function() {
    // print a message when the server starts listening
    console.log("server starting on " + appEnv.url);
});

require("cf-deployment-tracker-client").track();
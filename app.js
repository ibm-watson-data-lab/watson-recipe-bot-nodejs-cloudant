'use strict';

const cfenv = require('cfenv');
const cloudant = require('cloudant');
const dotenv = require('dotenv');
const express = require('express');
const CloudantRecipeStore = require('./CloudantRecipeStore');
const SousChef = require('./SousChef');

const appEnv = cfenv.getAppEnv();
const app = express();
const http = require('http').Server(app);

(function() {
    // load environment variables
    dotenv.config();
    let cloudantClient = cloudant({
        url: process.env.CLOUDANT_URL,
        plugin:'promises'
    });
    // start the souschef bot
    let sousChef = new SousChef(
        new CloudantRecipeStore(cloudantClient, process.env.CLOUDANT_DB_NAME),
        process.env.SLACK_BOT_TOKEN,
        process.env.SPOONACULAR_KEY,
        process.env.CONVERSATION_USERNAME,
        process.env.CONVERSATION_PASSWORD,
        process.env.CONVERSATION_WORKSPACE_ID,
        http
    );
    sousChef.run();
})();

app.use(express.static(__dirname + '/public'));

// set view engine and map views directory
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// map requests
app.get('/', function(req, res) {
    res.render('index.ejs', {webSocketHost: appEnv.bind, webSocketPort: appEnv.port});
});

// start server on the specified port and binding host
http.listen(appEnv.port, '0.0.0.0', () => {
    console.log("server starting on " + appEnv.url);
});

require("cf-deployment-tracker-client").track();
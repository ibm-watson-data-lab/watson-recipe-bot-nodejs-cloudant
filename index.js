var cloudant = require('cloudant');
var dotenv = require('dotenv');
var CloudantRecipeStore = require('./CloudantRecipeStore');
var SousChef = require('./SousChef');

// load from .env
dotenv.config();

var cloudantClient = cloudant({
    url: process.env.CLOUDANT_URL,
    plugin:'promises'
});

var sousChef = new SousChef(
	new CloudantRecipeStore(cloudantClient, process.env.CLOUDANT_DB_NAME),
	process.env.SLACK_BOT_TOKEN,
	process.env.SPOONACULAR_KEY,
	process.env.CONVERSATION_USERNAME,
	process.env.CONVERSATION_PASSWORD,
	process.env.CONVERSATION_WORKSPACE_ID
);
sousChef.run();
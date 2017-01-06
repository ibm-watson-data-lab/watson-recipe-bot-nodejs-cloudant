var remoteDbUrl = cloudantUrl + '/' + cloudantDbName;
var yesStrings = ['yes', 'yeah', 'sure', 'yup', 'yep'];
var noStrings = ['no', 'nah', 'nope'];
var app = new Vue({
    el: '#app',
    data: {
        db: null,
        webSocketProtocol: webSocketProtocol,
        webSocket: null,
        webSocketConnected: false,
        webSocketPingTimer: null,
        message: '',
        messages: [],
        awaitingResponse: false,
        offlineStep: 0
    },
    methods: {
        isMatch : function(msg, strLowers) {
            var msgLower = msg.toLowerCase();
            for (var i=0; i<strLowers.length; i++) {
                if (strLowers[i].indexOf(msgLower) >= 0) {
                    return true;
                }
            }
            return false;
        },
        showOfflineMessage: function() {
            if (app.offlineStep == 0) {
                app.offlineStep = 1;
                app.db.allDocs({include_docs: true, descending: true}, function (err, doc) {
                    var msg;
                    if (err || !doc.rows || doc.rows.length == 0) {
                        msg = 'Sorry, you are not connected! I can\'t help you right now :(';
                    }
                    else {
                        msg = 'Sorry, you are not connected! I have ' + doc.rows.length + ' recipes I can show you. Would you like to see what they are?'
                    }
                    app.messages.unshift({
                        user: 'sous-chef',
                        ts: new Date(),
                        msg: msg
                    });
                });
            }
            else if (app.offlineStep == 1) {
                if (app.isMatch(app.message,yesStrings)) {
                    app.offlineStep = 2;
                    app.db.allDocs({include_docs: true, descending: true}, function (err, doc) {
                        var msg = 'Great! Here are the recipes:';
                        for (var i=0; i<doc.rows.length; i++) {
                            msg += '\n' + (i+1) + '. ' + doc.rows[i].doc.title;
                        }
                        app.messages.unshift({
                            user: 'sous-chef',
                            ts: new Date(),
                            msg: msg
                        });
                    });
                }
                else {
                    var msg;
                    if (app.isMatch(app.message, noStrings)) {
                        app.offlineStep = 0;
                        msg = 'OK. Sounds good.';
                    }
                    else {
                        app.offlineStep = 1;
                        msg = 'Sorry, I didn\'t understand your response. Would you like to see the list of recipes?';
                    }
                    app.messages.unshift({
                        user: 'sous-chef',
                        ts: new Date(),
                        msg: msg
                    });
                }
            }
            else if (app.offlineStep == 2) {
                var selection = Number(app.message.trim());
                if (! isNaN(selection)) {
                    app.db.allDocs({include_docs: true, descending: true}, function (err, doc) {
                        var msg;
                        if (selection <= doc.rows.length) {
                            app.offlineStep = 0;
                            msg = doc.rows[selection-1].doc.instructions;
                        }
                        else {
                            app.offlineStep = 1;
                            msg = 'Sorry, I didn\'t understand your response. Would you like to see the list of recipes?';
                        }
                        app.messages.unshift({
                            user: 'sous-chef',
                            ts: new Date(),
                            msg: msg
                        });
                    });
                }
                else {
                    app.offlineStep = 1;
                    var msg = 'Sorry, I didn\'t understand your response. Would you like to see the list of recipes?';
                    app.messages.unshift({
                        user: 'sous-chef',
                        ts: new Date(),
                        msg: msg
                    });
                }

            }
        },
        submitMessage: function() {
            app.messages.unshift({
                user: 'Me',
                ts: new Date(),
                msg: app.message
            });
            if (! app.webSocketConnected) {
                app.showOfflineMessage();
            }
            else {
                app.webSocket.send(JSON.stringify({type: 'msg', text: app.message}));
                app.awaitingResponse = true;
            }
            app.message = '';
        },
        init() {
            // init pouchdb
            var opts = {
                live: true,
                filter: 'filter_by_type/recipe',
            };
            app.db = new PouchDB('watson_recipe_bot');
            app.db.replicate.from(remoteDbUrl, opts, function(err) {
                if (err) {
                    console.log('Error configuring pouchdb replication: ' + JSON.stringify(err));
                }
            });
            // register service worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker
                    .register('./service-worker.js')
                    .then(function() { console.log('Service Worker Registered'); });
            }
            setTimeout(app.onTimer, 1);
        },
        onTimer() {
            if (! app.webSocketConnected) {
                app.connect();
            }
            else {
                app.webSocket.send(JSON.stringify({type: 'ping'}));
            }
            setTimeout(app.onTimer, 5000);
        },
        connect() {
            if ("WebSocket" in window) {
                let webSocketUrl = app.webSocketProtocol + window.location.host;
                app.webSocket = new WebSocket(webSocketUrl);
                app.webSocket.onopen = function() {
                    console.log('Web socket connected.');
                    app.webSocketConnected = true;
                };
                app.webSocket.onmessage = function(evt)  {
                    console.log('Message received: ' + evt.data);
                    app.awaitingResponse = false;
                    app.webSocketConnected = true;
                    var data = JSON.parse(evt.data);
                    if (data.type == 'msg') {
                        app.messages.unshift({
                            user: 'sous-chef',
                            ts: new Date(),
                            msg: data.text
                        });
                    }
                    else if (data.type == 'ping') {
                        console.log('Received ping.');
                    }
                };
                app.webSocket.onclose = function() {
                    console.log('Websocket closed.');
                    if (app.webSocketConnected) {
                        app.offlineStep = 0;
                    }
                    if (app.awaitingResponse) {
                        app.awaitingResponse = false;
                        app.showOfflineMessage();
                    }
                    app.webSocketConnected = false;
                    app.webSocket = null;
                };
            }
            else {
                alert("WebSocket not supported browser.");
            }
        }
    }
});

(function() {
    // Initialize vue app
    app.init();
})();
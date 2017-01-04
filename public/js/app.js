var remoteDbUrl = cloudantUrl + '/' + cloudantDbName;
var app = new Vue({
    el: '#app',
    data: {
        db: null,
        webSocketHost: webSocketHost,
        webSocketPort: webSocketPort,
        webSocket: null,
        webSocketConnected: false,
        webSocketPingTimer: null,
        message: '',
        messages: []
    },
    methods: {
        submitMessage: function() {
            if (! app.webSocketConnected) {
                app.db.allDocs({include_docs: true, descending: true}, function(err, doc) {
                    app.messages.unshift({
                        user: 'sous-chef',
                        ts: new Date(),
                        msg: 'Sorry, you are not connected! I have ' + doc.rows.length + ' recipes I can show you. Would you like to see what they are?'
                    });
                });
            }
            else {
                app.messages.unshift({
                    user: 'Me',
                    ts: new Date(),
                    msg: app.message
                });
                app.webSocket.send(JSON.stringify({type: 'msg', text: app.message}));
                app.message = '';
            }
        },
        init() {
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
                app.webSocket = new WebSocket('ws://' + app.webSocketHost + ':' + app.webSocketPort);
                app.webSocket.onopen = function() {
                    console.log('Web socket connected.');
                    app.webSocketConnected = true;
                };
                app.webSocket.onmessage = function(evt)  {
                    console.log('Message received: ' + evt.data);
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
    // Register service worked
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(function() {
                console.log('Service Worker registered, configuring pouchdb replication...');
                var opts = {
                    live: true,
                    filter: 'filter_by_type/recipe',
                };
                app.db = new PouchDB('watson_recipe_bot');
                app.db.replicate.from(remoteDbUrl, opts, function(err) {
                    if (err) {
                        console.log('Error configuring pouchdb replication: ' + err);
                    }
                });
            });
    }
})();
var app = new Vue({
    el: '#app',
    data: {
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
                app.messages.push({
                    user: 'sous-chef',
                    ts: new Date(),
                    msg: 'You are not connected!'
                });
            }
            else {
                app.messages.push({
                    user: 'Me',
                    ts: new Date(),
                    msg: app.message
                });
                app.webSocket.send(JSON.stringify({type: 'msg', text: app.message}));
                app.message = '';
            }
        },
        init() {
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
                        app.messages.push({
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

app.init();
var app = new Vue({
    el: '#app',
    data: {
        webSocketHost: webSocketHost,
        webSocketPort: webSocketPort,
        webSocket: null,
        message: '',
        messages: []
    },
    methods: {
        submitMessage: function() {
            app.messages.push({
                user: 'Me',
                ts: new Date(),
                msg: app.message
            });
            app.webSocket.send(app.message);
            app.message = '';
        },
        init() {
            if ("WebSocket" in window) {
                app.webSocket = new WebSocket('ws://' + app.webSocketHost + ':' + app.webSocketPort);
                app.webSocket.onopen = function() {
                    console.log('Web socket connected.');
                };
                app.webSocket.onmessage = function(evt)  {
                    console.log('Message received: ' + evt.data);
                    app.messages.push({
                        user: 'sous-chef',
                        ts: new Date(),
                        msg: evt.data
                    });
                };
                app.webSocket.onclose = function() {
                    console.log('Websocket closed.');
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
'use strict';

const http = require('http');
const WebSocketClient = require('./WebSocketClient');
const WebSocketServer = require('websocket').server;
const EventEmitter = require('events');

class WebSocketBot extends EventEmitter {

    constructor() {
        super();
        this.clients = [];
    }

    start(httpServer) {
        // create http server and attach web socket server
        // var server = http.createServer((request, response) => {
        //     console.log(new Date() + ' WebSocket server received request for ' + request.url);
        //     response.writeHead(404);
        //     response.end();
        // });
        // server.listen(port, () => {
        //     console.log(new Date() + ' WebSocket server is listening on port ' + port);
        // });
        this.webSocketServer = new WebSocketServer({httpServer: httpServer, autoAcceptConnections: false});
        this.webSocketServer.on('request', (request) => {
            // route connection to webSocketController
            this.onWebSocketConnection(request);
        });
    }

    onWebSocketConnection(request) {
        console.log(new Date() + ' WebSocket connection accepted.');
        var connection = request.accept(null, request.origin);
        var client = new WebSocketClient(connection);
        this.clients.push(client);
        // call onMessageReceivedFromClient when a new message is received from the client
        connection.on('message', (message) => {
            if (message.type === 'utf8') {
                console.log(new Date() + ' WebSocket server received message: ' + message.utf8Data);
                this.onMessageReceivedFromClient(client, message.utf8Data);
            }
        });
        connection.on('close', () => {
            // remove the client from the array on close
            this.clients.splice(this.clients.indexOf(client), 1);
            console.log(new Date() + ' WebSocket client ' + connection.remoteAddress + ' disconnected.');
        });
    }

    onMessageReceivedFromClient(client, message) {
        this.emit('message', client, message);
    }

    sendMessageToClient(client, message) {
        client.send(message);
    }

}

module.exports = WebSocketBot;
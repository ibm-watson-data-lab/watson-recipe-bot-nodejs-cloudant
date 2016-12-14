'use strict';

const uuidV4 = require('uuid/v4');

class WebSocketClient {

    constructor(connection) {
        this.connection = connection;
        this.id = uuidV4();
    }

    send(message) {
        this.connection.sendUTF(message);
    }

}

module.exports = WebSocketClient;
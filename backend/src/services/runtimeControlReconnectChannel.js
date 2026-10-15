'use strict';

const { EventEmitter } = require('node:events');

const MAX_FRAME_BYTES = 64 * 1024;

class RuntimeControlReconnectChannel extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.connected = !socket.destroyed;
    this.buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', chunk => this.receive(chunk));
    socket.once('close', () => this.closed());
    socket.once('error', error => this.failed(error));
  }

  receive(chunk) {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > MAX_FRAME_BYTES) return this.destroy();
    let boundary = this.buffer.indexOf('\n');
    while (boundary >= 0) {
      const frame = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 1);
      if (frame) {
        try { this.emit('message', JSON.parse(frame)); }
        catch (_) { return this.destroy(); }
      }
      boundary = this.buffer.indexOf('\n');
    }
  }

  send(message, callback) {
    if (!this.connected) {
      callback?.(new Error('Reconnect channel is closed.'));
      return false;
    }
    let frame;
    try { frame = `${JSON.stringify(message)}\n`; }
    catch (error) { callback?.(error); return false; }
    if (Buffer.byteLength(frame) > MAX_FRAME_BYTES) {
      callback?.(new Error('Reconnect frame exceeds limit.'));
      return false;
    }
    return this.socket.write(frame, callback);
  }

  failed(error) {
    if (this.listenerCount('error')) this.emit('error', error);
  }

  closed() {
    if (!this.connected) return;
    this.connected = false;
    this.emit('disconnect');
    this.emit('close');
  }

  destroy() {
    this.socket.destroy();
  }
}

module.exports = { MAX_FRAME_BYTES, RuntimeControlReconnectChannel };

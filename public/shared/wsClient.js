// Reconnecting WebSocket wrapper.
// Usage:
//   const ws = new WsClient(onConnectFn);
//   ws.connect('ws://host/ws');
//   ws.onMessage(msg => { ... });
//   ws.send({ type: 'foo' });

export default class WsClient {
  constructor(onConnect) {
    this._onConnect = onConnect;   // called each (re)connect
    this._onMsg = null;
    this._onClose = null;
    this._socket = null;
    this._url = null;
    this._delay = 500;
    this._reconnectTimer = null;
    this._destroyed = false;
    this._connectionTimer = null;
    this._connectionTimeout = 5000;
  }

  connect(url) {
    this._url = url;
    this._open();
  }

  _open() {
    if (this._destroyed) return;
    const startTime = Date.now();
    console.log('[ws-client] Attempting connection to:', this._url, 'timeout:', this._connectionTimeout, 'ms');
    this._socket = new WebSocket(this._url);

    // Add a connection timeout — if socket doesn't open within 8 seconds, close it
    // and try reconnecting. This prevents hanging on network issues.
    // Edge and Safari need more aggressive timeout handling.
    this._connectionTimer = setTimeout(() => {
      if (this._socket && this._socket.readyState === WebSocket.CONNECTING) {
        console.warn('[ws-client] Connection timeout triggered after', this._connectionTimeout, 'ms');
        try {
          this._socket.close();
        } catch (e) {
          console.error('[ws-client] Error closing socket:', e.message);
        }
        // Let the close handler trigger reconnection
      }
    }, this._connectionTimeout);

    this._socket.addEventListener('open', () => {
      clearTimeout(this._connectionTimer);
      const elapsed = Date.now() - startTime;
      console.log('[ws-client] Connected in', elapsed, 'ms');
      this._delay = 1000; // reset backoff
      if (this._onConnect) this._onConnect();
    });

    this._socket.addEventListener('message', e => {
      try {
        const msg = JSON.parse(e.data);
        console.log('[ws-client] Raw message received:', msg.type);
        if (!this._onMsg) {
          console.warn('[ws-client] No message handler attached, ignoring message:', msg.type);
          return;
        }
        this._onMsg(msg);
      } catch (err) {
        console.error('[ws-client] Failed to parse or handle message:', err.message);
      }
    });

    this._socket.addEventListener('close', () => {
      clearTimeout(this._connectionTimer);
      if (this._destroyed) return;
      console.log('[ws-client] Connection closed, reconnecting in', this._delay, 'ms');
      if (this._onClose) this._onClose();
      this._reconnectTimer = setTimeout(() => this._open(), this._delay);
      this._delay = Math.min(this._delay * 2, 30000);
    });

    this._socket.addEventListener('error', (e) => {
      clearTimeout(this._connectionTimer);
      console.error('[ws-client] Connection error:', e);
    });
  }

  send(obj) {
    if (this._socket?.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify(obj));
    }
  }

  onMessage(fn) {
    this._onMsg = fn;
  }

  onClose(fn) {
    this._onClose = fn;
  }

  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._socket?.close();
  }
}

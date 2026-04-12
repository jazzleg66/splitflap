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
    this._messageQueue = [];
    this.history = []; // History of last 10 messages
  }

  connect(url) {
    this._url = url;
    this._open();
  }

  _open() {
    if (this._destroyed || this._isConnecting) return;
    this._isConnecting = true;
    
    const startTime = Date.now();
    console.log('[ws-client] Attempting connection...');
    this._socket = new WebSocket(this._url);

    this._connectionTimer = setTimeout(() => {
      if (this._socket && this._socket.readyState === WebSocket.CONNECTING) {
        console.warn('[ws-client] Connection timeout');
        this._isConnecting = false;
        try { this._socket.close(); } catch (e) {}
      }
    }, this._connectionTimeout);

    this._socket.addEventListener('open', () => {
      this._isConnecting = false;
      clearTimeout(this._connectionTimer);
      this._delay = 1000;
      if (this._onConnect) this._onConnect();
    });

    this._socket.addEventListener('message', e => {
      try {
        const msg = JSON.parse(e.data);
        this.history.push(msg);
        if (this.history.length > 10) this.history.shift();

        if (!this._onMsg) {
          this._messageQueue.push(msg);
          return;
        }
        this._onMsg(msg);
      } catch (err) {}
    });

    this._socket.addEventListener('close', () => {
      this._isConnecting = false;
      clearTimeout(this._connectionTimer);
      if (this._destroyed) return;
      if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
      this._reconnectTimer = setTimeout(() => this._open(), this._delay);
      this._delay = Math.min(this._delay * 2, 30000);
      if (this._onClose) this._onClose();
    });

    this._socket.addEventListener('error', (e) => {
      this._isConnecting = false;
      clearTimeout(this._connectionTimer);
    });
  }

  send(obj) {
    if (this._socket?.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify(obj));
    }
  }

  onMessage(fn) {
    this._onMsg = fn;
    if (this._onMsg && this._messageQueue.length > 0) {
      const queue = [...this._messageQueue];
      this._messageQueue = [];
      queue.forEach(msg => {
        try { this._onMsg(msg); } catch (err) {}
      });
    }
  }

  onClose(fn) {
    this._onClose = fn;
  }

  // Force-close the current socket so the reconnect logic kicks in.
  // Use this to escape zombie connections (open readyState but no data flowing).
  reset() {
    if (this._socket && this._socket.readyState !== WebSocket.CLOSED) {
      try { this._socket.close(); } catch (_) {}
    }
  }

  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._socket?.close();
  }
}

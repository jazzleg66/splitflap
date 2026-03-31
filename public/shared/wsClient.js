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
    this._socket = null;
    this._url = null;
    this._delay = 1000;
    this._reconnectTimer = null;
    this._destroyed = false;
  }

  connect(url) {
    this._url = url;
    this._open();
  }

  _open() {
    if (this._destroyed) return;
    this._socket = new WebSocket(this._url);

    this._socket.addEventListener('open', () => {
      this._delay = 1000; // reset backoff
      if (this._onConnect) this._onConnect();
    });

    this._socket.addEventListener('message', e => {
      if (!this._onMsg) return;
      try { this._onMsg(JSON.parse(e.data)); } catch {}
    });

    this._socket.addEventListener('close', () => {
      if (this._destroyed) return;
      this._reconnectTimer = setTimeout(() => this._open(), this._delay);
      this._delay = Math.min(this._delay * 2, 30000);
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

  destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    this._socket?.close();
  }
}

import WsClient from '../public/shared/wsClient.js';

describe('wsClient module', () => {
  let wsClient;
  let mockWebSocket;

  beforeEach(() => {
    mockWebSocket = {
      readyState: 0,
      send: jest.fn(),
      close: jest.fn(),
      addEventListener: jest.fn((event, cb) => {
        if (event === 'open') {
          mockWebSocket.onopen = cb;
        } else if (event === 'message') {
          mockWebSocket.onmessage = cb;
        } else if (event === 'close') {
          mockWebSocket.onclose = cb;
        } else if (event === 'error') {
          mockWebSocket.onerror = cb;
        }
      }),
    };

    global.WebSocket = jest.fn(() => mockWebSocket);
    global.WebSocket.CONNECTING = 0;
    global.WebSocket.OPEN = 1;
    global.WebSocket.CLOSED = 3;

    wsClient = new WsClient();
  });

  afterEach(() => {
    wsClient.destroy();
    jest.clearAllMocks();
  });

  it('connects to url', () => {
    wsClient.connect('ws://localhost/ws');
    expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost/ws');
  });

  it('calls onConnect callback when socket opens', () => {
    const onConnect = jest.fn();
    wsClient = new WsClient(onConnect);
    wsClient.connect('ws://localhost/ws');

    mockWebSocket.readyState = 1;
    mockWebSocket.onopen();

    expect(onConnect).toHaveBeenCalled();
  });

  it('queues messages if onMessage is not set', () => {
    wsClient.connect('ws://localhost/ws');

    mockWebSocket.onmessage({ data: JSON.stringify({ type: 'test' }) });
    expect(wsClient._messageQueue.length).toBe(1);

    const onMessage = jest.fn();
    wsClient.onMessage(onMessage);

    expect(onMessage).toHaveBeenCalledWith({ type: 'test' });
    expect(wsClient._messageQueue.length).toBe(0);
  });

  it('calls onMessage callback when message is received', () => {
    const onMessage = jest.fn();
    wsClient.onMessage(onMessage);
    wsClient.connect('ws://localhost/ws');

    mockWebSocket.onmessage({ data: JSON.stringify({ type: 'test' }) });

    expect(onMessage).toHaveBeenCalledWith({ type: 'test' });
    expect(wsClient.history.length).toBe(1);
  });

  it('sends data when socket is open', () => {
    wsClient.connect('ws://localhost/ws');
    mockWebSocket.readyState = 1;

    wsClient.send({ type: 'test' });

    expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test' }));
  });

  it('does not send data when socket is not open', () => {
    wsClient.connect('ws://localhost/ws');
    mockWebSocket.readyState = 0;

    wsClient.send({ type: 'test' });

    expect(mockWebSocket.send).not.toHaveBeenCalled();
  });

  it('calls onClose callback and tries to reconnect when closed', () => {
    jest.useFakeTimers();

    const onClose = jest.fn();
    wsClient.onClose(onClose);
    wsClient.connect('ws://localhost/ws');

    mockWebSocket.onclose();

    expect(onClose).toHaveBeenCalled();

    // Fast forward past delay
    jest.advanceTimersByTime(1000);

    expect(global.WebSocket).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('handles error gracefully', () => {
    wsClient.connect('ws://localhost/ws');
    mockWebSocket.onerror();
    expect(wsClient._isConnecting).toBe(false);
  });

  it('handles timeout correctly', () => {
    jest.useFakeTimers();

    wsClient.connect('ws://localhost/ws');
    mockWebSocket.readyState = 0; // CONNECTING

    // Fast forward past timeout
    jest.advanceTimersByTime(6000);

    expect(mockWebSocket.close).toHaveBeenCalled();
    expect(wsClient._isConnecting).toBe(false);

    jest.useRealTimers();
  });

  it('reset closes socket', () => {
    wsClient.connect('ws://localhost/ws');
    mockWebSocket.readyState = 1;

    wsClient.reset();

    expect(mockWebSocket.close).toHaveBeenCalled();
  });
});

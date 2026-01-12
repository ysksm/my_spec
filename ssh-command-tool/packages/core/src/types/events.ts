export interface SessionState {
  ssh: 'disconnected' | 'connecting' | 'connected';
  portForward: 'inactive' | 'active';
  browser: 'stopped' | 'starting' | 'running';
  cdp: 'disconnected' | 'connecting' | 'connected';
}

export interface SessionEvents {
  'state:change': (state: SessionState) => void;
  ready: () => void;
  error: (error: Error) => void;
  closed: () => void;
}

export interface WSMessage {
  type: 'session:state' | 'network:request' | 'network:response' | 'console:log' | 'error';
  payload: unknown;
  timestamp: number;
}

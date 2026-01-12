export class SSHToolError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SSHToolError';
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

// SSH-related errors
export class SSHConnectionError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'SSH_CONNECTION_ERROR', cause);
    this.name = 'SSHConnectionError';
  }
}

export class SSHAuthError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'SSH_AUTH_ERROR', cause);
    this.name = 'SSHAuthError';
  }
}

export class SSHTimeoutError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'SSH_TIMEOUT_ERROR', cause);
    this.name = 'SSHTimeoutError';
  }
}

export class SSHExecError extends SSHToolError {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
    cause?: Error
  ) {
    super(message, 'SSH_EXEC_ERROR', cause);
    this.name = 'SSHExecError';
  }
}

// CDP-related errors
export class CDPConnectionError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'CDP_CONNECTION_ERROR', cause);
    this.name = 'CDPConnectionError';
  }
}

export class CDPTimeoutError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'CDP_TIMEOUT_ERROR', cause);
    this.name = 'CDPTimeoutError';
  }
}

export class CDPProtocolError extends SSHToolError {
  constructor(
    message: string,
    public readonly errorCode?: number,
    cause?: Error
  ) {
    super(message, 'CDP_PROTOCOL_ERROR', cause);
    this.name = 'CDPProtocolError';
  }
}

// Browser-related errors
export class BrowserLaunchError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'BROWSER_LAUNCH_ERROR', cause);
    this.name = 'BrowserLaunchError';
  }
}

export class BrowserNotFoundError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'BROWSER_NOT_FOUND', cause);
    this.name = 'BrowserNotFoundError';
  }
}

// Config-related errors
export class ConfigError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

export class ValidationError extends SSHToolError {
  constructor(
    message: string,
    public readonly field?: string,
    cause?: Error
  ) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

// Port forwarding errors
export class PortForwardError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'PORT_FORWARD_ERROR', cause);
    this.name = 'PortForwardError';
  }
}

// Session errors
export class SessionError extends SSHToolError {
  constructor(message: string, cause?: Error) {
    super(message, 'SESSION_ERROR', cause);
    this.name = 'SessionError';
  }
}

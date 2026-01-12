import { EventEmitter } from 'eventemitter3';
import type { Server, Socket } from 'net';
import { createServer } from 'net';
import type { SSHClient } from './client';
import type { ForwardRule, PortForwarderEvents } from '../types';
import { PortForwardError } from '../errors';
import { generateId } from '../utils';

interface ActiveForward {
  rule: ForwardRule;
  server?: Server;
  connections: Set<Socket>;
}

export class PortForwarder extends EventEmitter<PortForwarderEvents> {
  private forwards = new Map<string, ActiveForward>();

  constructor(private sshClient: SSHClient) {
    super();
  }

  async startLocalForward(
    localPort: number,
    remoteHost: string,
    remotePort: number,
    localHost = '127.0.0.1'
  ): Promise<ForwardRule> {
    if (!this.sshClient.isConnected()) {
      throw new PortForwardError('SSH client is not connected');
    }

    const id = generateId();
    const rule: ForwardRule = {
      id,
      type: 'local',
      localHost,
      localPort,
      remoteHost,
      remotePort,
      state: 'inactive',
    };

    const server = createServer((socket) => {
      this.handleLocalConnection(id, socket);
    });

    const forward: ActiveForward = {
      rule,
      server,
      connections: new Set(),
    };

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(new PortForwardError(`Failed to start local forward: ${err.message}`, err));
      });

      server.listen(localPort, localHost, () => {
        rule.state = 'active';
        this.forwards.set(id, forward);
        this.emit('forward:started', rule);
        resolve(rule);
      });
    });
  }

  async startRemoteForward(
    remotePort: number,
    localHost: string,
    localPort: number,
    remoteHost = '127.0.0.1'
  ): Promise<ForwardRule> {
    if (!this.sshClient.isConnected()) {
      throw new PortForwardError('SSH client is not connected');
    }

    const id = generateId();
    const rule: ForwardRule = {
      id,
      type: 'remote',
      localHost,
      localPort,
      remoteHost,
      remotePort,
      state: 'inactive',
    };

    return new Promise((resolve, reject) => {
      const client = this.sshClient.getClient();

      client.forwardIn(remoteHost, remotePort, (err) => {
        if (err) {
          reject(new PortForwardError(`Failed to start remote forward: ${err.message}`, err));
          return;
        }

        rule.state = 'active';
        const forward: ActiveForward = {
          rule,
          connections: new Set(),
        };

        this.forwards.set(id, forward);
        this.emit('forward:started', rule);
        resolve(rule);
      });

      // Handle incoming connections on the remote forward
      client.on('tcp connection', (info, accept, reject) => {
        if (info.destPort === remotePort) {
          this.handleRemoteConnection(id, localHost, localPort, accept);
        }
      });
    });
  }

  async stop(id: string): Promise<void> {
    const forward = this.forwards.get(id);
    if (!forward) {
      return;
    }

    // Close all active connections
    for (const socket of forward.connections) {
      socket.destroy();
    }
    forward.connections.clear();

    if (forward.rule.type === 'local' && forward.server) {
      await new Promise<void>((resolve) => {
        forward.server!.close(() => resolve());
      });
    } else if (forward.rule.type === 'remote') {
      const client = this.sshClient.getClient();
      await new Promise<void>((resolve, reject) => {
        client.unforwardIn(forward.rule.remoteHost, forward.rule.remotePort, (err) => {
          if (err) {
            // Don't reject, just log - the forward might already be closed
            console.warn(`Warning: Failed to unforward: ${err.message}`);
          }
          resolve();
        });
      });
    }

    this.forwards.delete(id);
    this.emit('forward:stopped', id);
  }

  async stopAll(): Promise<void> {
    const stopPromises = Array.from(this.forwards.keys()).map((id) => this.stop(id));
    await Promise.all(stopPromises);
  }

  getActiveForwards(): ForwardRule[] {
    return Array.from(this.forwards.values())
      .filter((f) => f.rule.state === 'active')
      .map((f) => ({ ...f.rule }));
  }

  getForward(id: string): ForwardRule | undefined {
    const forward = this.forwards.get(id);
    return forward ? { ...forward.rule } : undefined;
  }

  private handleLocalConnection(forwardId: string, socket: Socket): void {
    const forward = this.forwards.get(forwardId);
    if (!forward || forward.rule.state !== 'active') {
      socket.destroy();
      return;
    }

    const { remoteHost, remotePort } = forward.rule;
    const client = this.sshClient.getClient();

    client.forwardOut(
      socket.remoteAddress || '127.0.0.1',
      socket.remotePort || 0,
      remoteHost,
      remotePort,
      (err, stream) => {
        if (err) {
          this.emit('forward:error', forwardId, new PortForwardError(`Forward connection failed: ${err.message}`, err));
          socket.destroy();
          return;
        }

        forward.connections.add(socket);

        this.emit('forward:connection', forwardId, {
          srcIP: socket.remoteAddress || 'unknown',
          srcPort: socket.remotePort || 0,
        });

        // Pipe data between local socket and SSH stream
        socket.pipe(stream);
        stream.pipe(socket);

        socket.on('close', () => {
          forward.connections.delete(socket);
          stream.close();
        });

        stream.on('close', () => {
          forward.connections.delete(socket);
          socket.destroy();
        });

        socket.on('error', (err) => {
          forward.connections.delete(socket);
          stream.close();
        });

        stream.on('error', (err) => {
          forward.connections.delete(socket);
          socket.destroy();
        });
      }
    );
  }

  private handleRemoteConnection(
    forwardId: string,
    localHost: string,
    localPort: number,
    accept: () => any
  ): void {
    const forward = this.forwards.get(forwardId);
    if (!forward || forward.rule.state !== 'active') {
      return;
    }

    const stream = accept();
    const socket = new (require('net').Socket)();

    socket.connect(localPort, localHost, () => {
      forward.connections.add(socket);

      this.emit('forward:connection', forwardId, {
        srcIP: 'remote',
        srcPort: forward.rule.remotePort,
      });

      socket.pipe(stream);
      stream.pipe(socket);
    });

    socket.on('close', () => {
      forward.connections.delete(socket);
      stream.close();
    });

    stream.on('close', () => {
      forward.connections.delete(socket);
      socket.destroy();
    });

    socket.on('error', () => {
      forward.connections.delete(socket);
      stream.close();
    });

    stream.on('error', () => {
      forward.connections.delete(socket);
      socket.destroy();
    });
  }
}

import Docker from 'dockerode';
import { resolve } from 'path';
import { logger } from '../utils/logger';
import type { DatabaseManager, UserSettings } from '../db/database';

export interface ContainerConfig {
  telegramId: number;
  apiId: string;
  apiHash: string;
  settings: UserSettings;
}

export class ContainerManager {
  private docker: Docker;
  private sessionsDir: string;
  private configDir: string;
  private hostSessionsDir: string;
  private hostConfigDir: string;
  private agentImage: string;
  private networkName: string;

  constructor(
    dockerSocket: string,
    sessionsDir: string,
    configDir: string,
    agentImage: string,
    networkName: string,
    hostSessionsDir?: string,
    hostConfigDir?: string
  ) {
    this.docker = new Docker({ socketPath: dockerSocket });
    this.sessionsDir = resolve(sessionsDir);
    this.configDir = resolve(configDir);
    // For Docker-in-Docker, use host paths if provided, otherwise use local paths
    this.hostSessionsDir = hostSessionsDir || this.sessionsDir;
    this.hostConfigDir = hostConfigDir || this.configDir;
    this.agentImage = agentImage;
    this.networkName = networkName;
  }

  async createContainer(config: ContainerConfig): Promise<string> {
    const { telegramId, apiId, apiHash, settings } = config;
    const containerName = `agent-${telegramId}`;

    logger.info({ telegramId, containerName }, 'Creating agent container');

    try {
      // Check if container already exists
      const existing = await this.getContainer(containerName);
      if (existing) {
        logger.warn({ containerName }, 'Container already exists, removing old one');
        await this.removeContainer(containerName);
      }

      // Create container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: this.agentImage,
        Env: [
          `TG_API_ID=${apiId}`,
          `TG_API_HASH=${apiHash}`,
          `USER_ID=${telegramId}`,
          `LOW_THRESHOLD=${settings.low_threshold}`,
          `ACTION_THRESHOLD=${settings.action_threshold}`,
          `DEFAULT_ACTION=${settings.default_action}`,
          `ENABLE_DELETION=${settings.enable_deletion ? 'true' : 'false'}`,
          `ENABLE_BLOCKING=${settings.enable_blocking ? 'true' : 'false'}`,
          `LOG_LEVEL=${process.env.LOG_LEVEL || 'info'}`,
          `CONFIG_PATH=/app/config/default.json`,
        ],
        HostConfig: {
          Binds: [
            `${this.hostSessionsDir}/${telegramId}:/app/tdlib-data:rw`,
            `${this.hostConfigDir}:/app/config:ro`,
          ],
          RestartPolicy: {
            Name: 'unless-stopped',
          },
          NanoCpus: this.parseCpuLimit(process.env.CONTAINER_CPU_LIMIT || '0.5'),
          Memory: this.parseMemoryLimit(process.env.CONTAINER_MEMORY_LIMIT || '512M'),
          SecurityOpt: ['no-new-privileges:true'],
          CapDrop: ['ALL'],
        },
        NetworkingConfig: {
          EndpointsConfig: {
            [this.networkName]: {},
          },
        },
      });

      await container.start();

      logger.info({ telegramId, containerId: container.id }, 'Container started');
      return container.id;

    } catch (error) {
      logger.error({ telegramId, error }, 'Failed to create container');
      throw error;
    }
  }

  async stopContainer(containerName: string): Promise<void> {
    logger.info({ containerName }, 'Stopping container');
    
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        logger.warn({ containerName }, 'Container not found');
        return;
      }

      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 10 }); // 10 second grace period
        logger.info({ containerName }, 'Container stopped');
      }
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to stop container');
      throw error;
    }
  }

  async removeContainer(containerName: string): Promise<void> {
    logger.info({ containerName }, 'Removing container');
    
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        logger.warn({ containerName }, 'Container not found');
        return;
      }

      const info = await container.inspect();
      if (info.State.Running) {
        await container.stop({ t: 10 });
      }

      await container.remove();
      logger.info({ containerName }, 'Container removed');
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to remove container');
      throw error;
    }
  }

  async getContainerStatus(containerName: string): Promise<{
    status: 'running' | 'stopped' | 'not_found';
    uptime?: number;
    health?: string;
  }> {
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        return { status: 'not_found' };
      }

      const info = await container.inspect();
      
      if (info.State.Running) {
        const startedAt = new Date(info.State.StartedAt).getTime();
        const uptime = Math.floor((Date.now() - startedAt) / 1000);
        
        return {
          status: 'running',
          uptime,
          health: info.State.Health?.Status || 'unknown',
        };
      } else {
        return { status: 'stopped' };
      }
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to get container status');
      throw error;
    }
  }

  async getContainerLogs(containerName: string, tail = 100): Promise<string> {
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        throw new Error('Container not found');
      }

      const stream = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true,
      });

      return stream.toString('utf-8');
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to get container logs');
      throw error;
    }
  }

  async restartContainer(containerName: string): Promise<void> {
    logger.info({ containerName }, 'Restarting container');
    
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        throw new Error('Container not found');
      }

      await container.restart({ t: 10 });
      logger.info({ containerName }, 'Container restarted');
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to restart container');
      throw error;
    }
  }

  async healthCheck(db: DatabaseManager): Promise<void> {
    logger.debug('Running container health check');
    
    const activeContainers = db.getAllActiveContainers();
    
    for (const dbContainer of activeContainers) {
      const containerName = `agent-${dbContainer.telegram_id}`;
      const status = await this.getContainerStatus(containerName);
      
      if (status.status === 'not_found') {
        logger.warn({ containerName, telegramId: dbContainer.telegram_id }, 'Container not found, marking as failed');
        db.updateContainerStatus(dbContainer.container_id, 'failed');
      } else if (status.status === 'stopped') {
        logger.warn({ containerName, telegramId: dbContainer.telegram_id }, 'Container stopped unexpectedly');
        db.updateContainerStatus(dbContainer.container_id, 'stopped');
      } else if (dbContainer.status === 'starting') {
        // Check if container has been starting for too long (> 5 min)
        const now = Math.floor(Date.now() / 1000);
        const age = now - dbContainer.created_at;
        if (age > 300) {
          logger.warn({ containerName, telegramId: dbContainer.telegram_id, age }, 'Container stuck in starting state');
          db.updateContainerStatus(dbContainer.container_id, 'failed');
        } else {
          // Still starting, update to running if actually running
          db.updateContainerStatus(dbContainer.container_id, 'running');
        }
      }
    }
  }

  private async getContainer(nameOrId: string): Promise<Docker.Container | null> {
    try {
      const container = this.docker.getContainer(nameOrId);
      await container.inspect(); // Check if exists
      return container;
    } catch (error) {
      if ((error as any).statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  private parseCpuLimit(limit: string): number {
    // Convert CPU limit like "0.5" to NanoCPUs (1 CPU = 1e9 NanoCPUs)
    return parseFloat(limit) * 1e9;
  }

  private parseMemoryLimit(limit: string): number {
    // Convert memory limit like "512M" to bytes
    const match = limit.match(/^(\d+)([KMG])$/i);
    if (!match) {
      throw new Error(`Invalid memory limit format: ${limit}`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toUpperCase();
    
    const multipliers: Record<string, number> = {
      'K': 1024,
      'M': 1024 * 1024,
      'G': 1024 * 1024 * 1024,
    };
    
    return value * multipliers[unit];
  }

  /**
   * Get container IP address for HTTP communication
   */
  async getContainerIp(containerName: string): Promise<string | null> {
    try {
      const container = await this.getContainer(containerName);
      if (!container) {
        return null;
      }

      const info = await container.inspect();
      return info.NetworkSettings.Networks[this.networkName]?.IPAddress || null;
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to get container IP');
      return null;
    }
  }

  /**
   * Helper to retry fetch with exponential backoff
   */
  private async fetchWithRetry(
    url: string, 
    options: RequestInit, 
    maxRetries = 3, 
    initialDelay = 1000
  ): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn({ url, attempt, error: lastError.message }, 'Fetch attempt failed, retrying...');
        
        if (attempt < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Fetch failed after retries');
  }

  /**
   * Send phone number to agent for authentication
   */
  async submitPhoneNumber(containerName: string, phoneNumber: string): Promise<void> {
    try {
      const response = await this.fetchWithRetry(
        `http://${containerName}:3100/auth/phone`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number: phoneNumber }),
        }
      );

      if (!response.ok) {
        const error: any = await response.json();
        throw new Error(error.details || 'Failed to submit phone number');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(`Cannot reach agent container ${containerName}:3100 - ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send authentication code to agent
   */
  async submitAuthCode(containerName: string, code: string): Promise<void> {
    try {
      const response = await this.fetchWithRetry(
        `http://${containerName}:3100/auth/code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        }
      );

      if (!response.ok) {
        const error: any = await response.json();
        throw new Error(error.details || 'Failed to submit authentication code');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(`Cannot reach agent container ${containerName}:3100 - ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Send 2FA password to agent
   */
  async submit2FAPassword(containerName: string, password: string): Promise<void> {
    try {
      const response = await this.fetchWithRetry(
        `http://${containerName}:3100/auth/password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        }
      );

      if (!response.ok) {
        const error: any = await response.json();
        throw new Error(error.details || 'Failed to submit 2FA password');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('fetch')) {
        throw new Error(`Cannot reach agent container ${containerName}:3100 - ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse auth state from container logs
   */
  async getAuthStateFromLogs(containerName: string): Promise<string | null> {
    try {
      const logs = await this.getContainerLogs(containerName, 50);
      
      // Look for auth event markers in logs
      if (logs.includes('AUTH_WAIT_PHONE')) {
        return 'wait_phone';
      } else if (logs.includes('AUTH_WAIT_CODE')) {
        return 'wait_code';
      } else if (logs.includes('AUTH_WAIT_PASSWORD')) {
        return 'wait_password';
      } else if (logs.includes('AUTH_READY')) {
        return 'ready';
      }
      
      return 'none';
    } catch (error) {
      logger.error({ containerName, error }, 'Failed to parse auth state from logs');
      return null;
    }
  }
}

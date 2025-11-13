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
  private agentImage: string;

  constructor(
    dockerSocket: string,
    sessionsDir: string,
    configDir: string,
    agentImage: string
  ) {
    this.docker = new Docker({ socketPath: dockerSocket });
    this.sessionsDir = resolve(sessionsDir);
    this.configDir = resolve(configDir);
    this.agentImage = agentImage;
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
        ],
        HostConfig: {
          Binds: [
            `${this.sessionsDir}/${telegramId}:/app/tdlib-data:rw`,
            `${this.configDir}:/app/config:ro`,
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
            'agent-network': {},
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
}

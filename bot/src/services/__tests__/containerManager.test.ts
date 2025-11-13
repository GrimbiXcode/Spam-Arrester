import { ContainerManager, ContainerConfig } from '../containerManager';
import { UserSettings } from '../../db/database';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock dockerode
const mockContainer = {
  id: 'mock-container-id-12345',
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  restart: jest.fn().mockResolvedValue(undefined),
  inspect: jest.fn(),
  logs: jest.fn(),
};

const mockDockerCreateContainer = jest.fn().mockResolvedValue(mockContainer);
const mockDockerGetContainer = jest.fn().mockReturnValue(mockContainer);

jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    createContainer: mockDockerCreateContainer,
    getContainer: mockDockerGetContainer,
  }));
});

describe('ContainerManager', () => {
  let containerManager: ContainerManager;
  const dockerSocket = '/var/run/docker.sock';
  const sessionsDir = '/tmp/sessions';
  const configDir = '/tmp/config';
  const agentImage = 'spam-arrester-agent:latest';

  beforeEach(() => {
    jest.clearAllMocks();
    containerManager = new ContainerManager(
      dockerSocket,
      sessionsDir,
      configDir,
      agentImage
    );
  });

  describe('Resource limit parsing', () => {
    describe('parseCpuLimit', () => {
      it('should correctly parse CPU limits from string to NanoCPUs for 0.5 CPU', () => {
        // Access private method via type assertion for testing
        const parseCpuLimit = (containerManager as any).parseCpuLimit.bind(containerManager);
        
        const result = parseCpuLimit('0.5');
        
        expect(result).toBe(500000000); // 0.5 * 1e9
      });

      it('should correctly parse CPU limits from string to NanoCPUs for 1 CPU', () => {
        const parseCpuLimit = (containerManager as any).parseCpuLimit.bind(containerManager);
        
        const result = parseCpuLimit('1');
        
        expect(result).toBe(1000000000); // 1 * 1e9
      });

      it('should correctly parse CPU limits from string to NanoCPUs for 2.5 CPUs', () => {
        const parseCpuLimit = (containerManager as any).parseCpuLimit.bind(containerManager);
        
        const result = parseCpuLimit('2.5');
        
        expect(result).toBe(2500000000); // 2.5 * 1e9
      });

      it('should correctly parse CPU limits from string to NanoCPUs for 0.25 CPU', () => {
        const parseCpuLimit = (containerManager as any).parseCpuLimit.bind(containerManager);
        
        const result = parseCpuLimit('0.25');
        
        expect(result).toBe(250000000); // 0.25 * 1e9
      });

      it('should handle integer strings', () => {
        const parseCpuLimit = (containerManager as any).parseCpuLimit.bind(containerManager);
        
        const result = parseCpuLimit('4');
        
        expect(result).toBe(4000000000); // 4 * 1e9
      });
    });

    describe('parseMemoryLimit', () => {
      it('should correctly parse memory limits from string to bytes for KB', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        const result = parseMemoryLimit('512K');
        
        expect(result).toBe(512 * 1024); // 524,288 bytes
      });

      it('should correctly parse memory limits from string to bytes for MB', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        const result = parseMemoryLimit('512M');
        
        expect(result).toBe(512 * 1024 * 1024); // 536,870,912 bytes
      });

      it('should correctly parse memory limits from string to bytes for GB', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        const result = parseMemoryLimit('2G');
        
        expect(result).toBe(2 * 1024 * 1024 * 1024); // 2,147,483,648 bytes
      });

      it('should be case-insensitive for units', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        const resultLower = parseMemoryLimit('256m');
        const resultUpper = parseMemoryLimit('256M');
        
        expect(resultLower).toBe(256 * 1024 * 1024);
        expect(resultUpper).toBe(256 * 1024 * 1024);
        expect(resultLower).toBe(resultUpper);
      });

      it('should handle different numeric values correctly', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        expect(parseMemoryLimit('1024K')).toBe(1024 * 1024);
        expect(parseMemoryLimit('1M')).toBe(1024 * 1024);
        expect(parseMemoryLimit('128M')).toBe(128 * 1024 * 1024);
        expect(parseMemoryLimit('1G')).toBe(1024 * 1024 * 1024);
      });

      it('should throw error for invalid format', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        expect(() => parseMemoryLimit('512')).toThrow('Invalid memory limit format: 512');
        expect(() => parseMemoryLimit('512MB')).toThrow('Invalid memory limit format: 512MB');
        expect(() => parseMemoryLimit('invalid')).toThrow('Invalid memory limit format: invalid');
      });

      it('should throw error for unsupported units', () => {
        const parseMemoryLimit = (containerManager as any).parseMemoryLimit.bind(containerManager);
        
        expect(() => parseMemoryLimit('512T')).toThrow('Invalid memory limit format: 512T');
        expect(() => parseMemoryLimit('512B')).toThrow('Invalid memory limit format: 512B');
      });
    });
  });

  describe('Container lifecycle', () => {
    const mockSettings: UserSettings = {
      telegram_id: 12345,
      low_threshold: 0.3,
      action_threshold: 0.85,
      default_action: 'archive',
      enable_deletion: 0,
      enable_blocking: 0,
    };

    const mockConfig: ContainerConfig = {
      telegramId: 12345,
      apiId: 'test-api-id',
      apiHash: 'test-api-hash',
      settings: mockSettings,
    };

    beforeEach(() => {
      // Set up default environment variables
      process.env.CONTAINER_CPU_LIMIT = '0.5';
      process.env.CONTAINER_MEMORY_LIMIT = '512M';
      process.env.LOG_LEVEL = 'info';
    });

    describe('createContainer', () => {
      it('should create container with correct configuration', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        const containerId = await containerManager.createContainer(mockConfig);

        expect(mockDockerCreateContainer).toHaveBeenCalledWith({
          name: 'agent-12345',
          Image: agentImage,
          Env: [
            'TG_API_ID=test-api-id',
            'TG_API_HASH=test-api-hash',
            'USER_ID=12345',
            'LOW_THRESHOLD=0.3',
            'ACTION_THRESHOLD=0.85',
            'DEFAULT_ACTION=archive',
            'ENABLE_DELETION=false',
            'ENABLE_BLOCKING=false',
            'LOG_LEVEL=info',
          ],
          HostConfig: {
            Binds: [
              '/tmp/sessions/12345:/app/tdlib-data:rw',
              '/tmp/config:/app/config:ro',
            ],
            RestartPolicy: {
              Name: 'unless-stopped',
            },
            NanoCpus: 500000000, // 0.5 CPU
            Memory: 536870912, // 512MB in bytes
            SecurityOpt: ['no-new-privileges:true'],
            CapDrop: ['ALL'],
          },
          NetworkingConfig: {
            EndpointsConfig: {
              'agent-network': {},
            },
          },
        });

        expect(mockContainer.start).toHaveBeenCalled();
        expect(containerId).toBe('mock-container-id-12345');
      });

      it('should use custom resource limits from environment', async () => {
        process.env.CONTAINER_CPU_LIMIT = '2';
        process.env.CONTAINER_MEMORY_LIMIT = '1G';

        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        // Recreate container manager with new env vars
        containerManager = new ContainerManager(
          dockerSocket,
          sessionsDir,
          configDir,
          agentImage
        );

        await containerManager.createContainer(mockConfig);

        expect(mockDockerCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            HostConfig: expect.objectContaining({
              NanoCpus: 2000000000, // 2 CPUs
              Memory: 1073741824, // 1GB in bytes
            }),
          })
        );
      });

      it('should apply CPU and memory limits correctly', async () => {
        process.env.CONTAINER_CPU_LIMIT = '1.5';
        process.env.CONTAINER_MEMORY_LIMIT = '768M';

        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        containerManager = new ContainerManager(
          dockerSocket,
          sessionsDir,
          configDir,
          agentImage
        );

        await containerManager.createContainer(mockConfig);

        expect(mockDockerCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            HostConfig: expect.objectContaining({
              NanoCpus: 1500000000, // 1.5 CPUs
              Memory: 805306368, // 768MB in bytes
            }),
          })
        );
      });

      it('should remove existing container before creating new one', async () => {
        const existingContainer = {
          inspect: jest.fn().mockResolvedValue({
            State: { Running: true },
          }),
          stop: jest.fn().mockResolvedValue(undefined),
          remove: jest.fn().mockResolvedValue(undefined),
        };

        mockDockerGetContainer
          .mockReturnValueOnce(existingContainer) // First call to check existence
          .mockReturnValueOnce(existingContainer) // Second call in removeContainer
          .mockReturnValueOnce(existingContainer); // Third call for stop check

        await containerManager.createContainer(mockConfig);

        expect(existingContainer.stop).toHaveBeenCalledWith({ t: 10 });
        expect(existingContainer.remove).toHaveBeenCalled();
        expect(mockDockerCreateContainer).toHaveBeenCalled();
      });

      it('should convert enable_deletion boolean correctly', async () => {
        const configWithDeletion: ContainerConfig = {
          ...mockConfig,
          settings: {
            ...mockSettings,
            enable_deletion: 1,
            enable_blocking: 1,
          },
        };

        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        await containerManager.createContainer(configWithDeletion);

        expect(mockDockerCreateContainer).toHaveBeenCalledWith(
          expect.objectContaining({
            Env: expect.arrayContaining([
              'ENABLE_DELETION=true',
              'ENABLE_BLOCKING=true',
            ]),
          })
        );
      });

      it('should handle container creation failure', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        mockDockerCreateContainer.mockRejectedValueOnce(new Error('Docker error'));

        await expect(
          containerManager.createContainer(mockConfig)
        ).rejects.toThrow('Docker error');
      });
    });

    describe('stopContainer', () => {
      it('should stop running container', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: { Running: true },
        });

        await containerManager.stopContainer('agent-12345');

        expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
      });

      it('should not stop already stopped container', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: { Running: false },
        });

        await containerManager.stopContainer('agent-12345');

        expect(mockContainer.stop).not.toHaveBeenCalled();
      });

      it('should handle non-existent container gracefully', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        await containerManager.stopContainer('agent-12345');

        expect(mockContainer.stop).not.toHaveBeenCalled();
      });
    });

    describe('removeContainer', () => {
      it('should stop and remove running container', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: { Running: true },
        });

        await containerManager.removeContainer('agent-12345');

        expect(mockContainer.stop).toHaveBeenCalledWith({ t: 10 });
        expect(mockContainer.remove).toHaveBeenCalled();
      });

      it('should remove stopped container without stopping', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: { Running: false },
        });

        await containerManager.removeContainer('agent-12345');

        expect(mockContainer.stop).not.toHaveBeenCalled();
        expect(mockContainer.remove).toHaveBeenCalled();
      });
    });

    describe('getContainerStatus', () => {
      it('should return running status with uptime', async () => {
        const startedAt = new Date(Date.now() - 60000).toISOString(); // 60 seconds ago
        mockContainer.inspect.mockResolvedValue({
          State: {
            Running: true,
            StartedAt: startedAt,
            Health: { Status: 'healthy' },
          },
        });

        const status = await containerManager.getContainerStatus('agent-12345');

        expect(status.status).toBe('running');
        expect(status.uptime).toBeGreaterThanOrEqual(60);
        expect(status.health).toBe('healthy');
      });

      it('should return stopped status', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: { Running: false },
        });

        const status = await containerManager.getContainerStatus('agent-12345');

        expect(status.status).toBe('stopped');
        expect(status.uptime).toBeUndefined();
      });

      it('should return not_found for non-existent container', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        const status = await containerManager.getContainerStatus('agent-12345');

        expect(status.status).toBe('not_found');
      });

      it('should handle missing health information', async () => {
        mockContainer.inspect.mockResolvedValue({
          State: {
            Running: true,
            StartedAt: new Date().toISOString(),
          },
        });

        const status = await containerManager.getContainerStatus('agent-12345');

        expect(status.status).toBe('running');
        expect(status.health).toBe('unknown');
      });
    });

    describe('restartContainer', () => {
      it('should restart container', async () => {
        await containerManager.restartContainer('agent-12345');

        expect(mockContainer.restart).toHaveBeenCalledWith({ t: 10 });
      });

      it('should throw error for non-existent container', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        await expect(
          containerManager.restartContainer('agent-12345')
        ).rejects.toThrow('Container not found');
      });
    });

    describe('getContainerLogs', () => {
      it('should retrieve container logs', async () => {
        const mockLogs = Buffer.from('log line 1\nlog line 2\n');
        mockContainer.logs.mockResolvedValue(mockLogs);

        const logs = await containerManager.getContainerLogs('agent-12345', 100);

        expect(mockContainer.logs).toHaveBeenCalledWith({
          stdout: true,
          stderr: true,
          tail: 100,
          timestamps: true,
        });
        expect(logs).toBe('log line 1\nlog line 2\n');
      });

      it('should use default tail value', async () => {
        mockContainer.logs.mockResolvedValue(Buffer.from('logs'));

        await containerManager.getContainerLogs('agent-12345');

        expect(mockContainer.logs).toHaveBeenCalledWith(
          expect.objectContaining({ tail: 100 })
        );
      });

      it('should throw error for non-existent container', async () => {
        mockDockerGetContainer.mockReturnValueOnce({
          inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
        });

        await expect(
          containerManager.getContainerLogs('agent-12345')
        ).rejects.toThrow('Container not found');
      });
    });
  });

  describe('Integration with resource limits', () => {
    it('should apply both CPU and memory limits when creating container', async () => {
      process.env.CONTAINER_CPU_LIMIT = '0.75';
      process.env.CONTAINER_MEMORY_LIMIT = '256M';

      containerManager = new ContainerManager(
        dockerSocket,
        sessionsDir,
        configDir,
        agentImage
      );

      mockDockerGetContainer.mockReturnValueOnce({
        inspect: jest.fn().mockRejectedValue({ statusCode: 404 }),
      });

      const mockConfig: ContainerConfig = {
        telegramId: 99999,
        apiId: 'test-id',
        apiHash: 'test-hash',
        settings: {
          telegram_id: 99999,
          low_threshold: 0.3,
          action_threshold: 0.85,
          default_action: 'log',
          enable_deletion: 0,
          enable_blocking: 0,
        },
      };

      await containerManager.createContainer(mockConfig);

      expect(mockDockerCreateContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          HostConfig: expect.objectContaining({
            NanoCpus: 750000000, // 0.75 * 1e9
            Memory: 268435456, // 256 * 1024 * 1024
          }),
        })
      );
    });
  });
});

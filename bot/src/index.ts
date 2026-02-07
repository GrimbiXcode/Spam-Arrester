import 'dotenv/config';
import { resolve, join } from 'path';
import { promises as fs } from 'fs';
import { createBot } from './bot';
import { DatabaseManager } from './db/database';
import { ContainerManager } from './services/containerManager';
import { WebApiServer } from './webApi';
import { setWebApiRef } from './commands/start';
import { logger } from './utils/logger';
import { defaultConfigTemplate } from './config/defaultConfig';

async function ensureDefaultConfig(configDir: string): Promise<void> {
  const defaultConfigPath = join(configDir, 'default.json');

  try {
    await fs.access(defaultConfigPath);
    return;
  } catch {
    // File does not exist; create it from template.
  }

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(defaultConfigPath, JSON.stringify(defaultConfigTemplate, null, 2), 'utf-8');
  logger.info({ defaultConfigPath }, 'Created missing default config');
}

async function main() {
  // Validate required environment variables
  const requiredEnvVars = ['BOT_TOKEN', 'TG_API_ID', 'TG_API_HASH'];
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error({ envVar }, 'Missing required environment variable');
      process.exit(1);
    }
  }

  // Initialize database
  const dbPath = resolve(process.env.DB_PATH || '../data/orchestrator.db');
  const db = new DatabaseManager(dbPath);
  logger.info('Database initialized');

  // Initialize container manager
  const dockerSocket = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
  const sessionsDir = resolve(process.env.SESSIONS_DIR || '../sessions');
  const configDir = resolve(process.env.CONFIG_DIR || '../config');
  const hostSessionsDir = process.env.HOST_SESSIONS_DIR; // Host path for Docker-in-Docker
  const hostConfigDir = process.env.HOST_CONFIG_DIR; // Host path for Docker-in-Docker
  const agentImage = process.env.AGENT_IMAGE || 'spam-arrester-agent:latest';
  const networkName = process.env.AGENT_NETWORK || 'spam-arrester_agent-network';

  await ensureDefaultConfig(configDir);

  const containerMgr = new ContainerManager(
    dockerSocket,
    sessionsDir,
    configDir,
    agentImage,
    networkName,
    hostSessionsDir,
    hostConfigDir
  );
  logger.info('Container manager initialized');

  // Create web API server
  const webApiPort = parseInt(process.env.WEB_API_PORT || '3000', 10);
  const webApi = new WebApiServer(db, containerMgr, webApiPort);
  await webApi.start();
  logger.info('Web API server initialized');

  // Set webApi reference for deep link verification in start command
  setWebApiRef(webApi);

  // Create bot
  const bot = createBot(process.env.BOT_TOKEN!, db, containerMgr);
  logger.info('Bot created');

  // Start periodic health checks
  setInterval(async () => {
    try {
      await containerMgr.healthCheck(db);
    } catch (error) {
      logger.error({ error }, 'Health check failed');
    }
  }, 60000); // Every minute

  // Start periodic cleanup
  setInterval(() => {
    try {
      db.cleanOldAuditLogs(30);
      db.cleanOldMetrics(90);
    } catch (error) {
      logger.error({ error }, 'Cleanup failed');
    }
  }, 86400000); // Daily

  // Graceful shutdown
  process.once('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');
    bot.stop('SIGINT');
    await webApi.stop();
    db.close();
    process.exit(0);
  });

  process.once('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    bot.stop('SIGTERM');
    await webApi.stop();
    db.close();
    process.exit(0);
  });

  // Launch bot
  await bot.launch();
  logger.info('Bot launched successfully');
}

main().catch((error) => {
  logger.error({ message: error.message, stack: error.stack, originalError: error }, 'Fatal error during startup');
  process.exit(1);
});

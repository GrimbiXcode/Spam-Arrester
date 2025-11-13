import 'dotenv/config';
import { resolve } from 'path';
import { createBot } from './bot';
import { DatabaseManager } from './db/database';
import { ContainerManager } from './services/containerManager';
import { logger } from './utils/logger';

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
  const agentImage = process.env.AGENT_IMAGE || 'spam-arrester-agent:latest';

  const containerMgr = new ContainerManager(
    dockerSocket,
    sessionsDir,
    configDir,
    agentImage
  );
  logger.info('Container manager initialized');

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
  process.once('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    bot.stop('SIGINT');
    db.close();
    process.exit(0);
  });

  process.once('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    bot.stop('SIGTERM');
    db.close();
    process.exit(0);
  });

  // Launch bot
  await bot.launch();
  logger.info('Bot launched successfully');
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error during startup');
  process.exit(1);
});

import { configure, createClient } from 'tdl';
import { getTdjson } from 'prebuilt-tdlib';
import { config } from './config';
import { logger } from './utils/logger';
import { MessageHandler } from './handlers/messageHandler';

// Configure TDLib with prebuilt binary
configure({ tdjson: getTdjson() });

async function main() {
  logger.info('Starting Spam Arrester Agent...');
  logger.info({
    enableBlocking: config.actions.enableBlocking,
    enableDeletion: config.actions.enableDeletion,
    defaultAction: config.actions.defaultAction,
  }, 'Configuration loaded');

  // Initialize TDLib client
  const client = createClient({
    apiId: config.telegram.apiId,
    apiHash: config.telegram.apiHash,
    databaseDirectory: config.telegram.databaseDirectory,
    filesDirectory: config.telegram.filesDirectory,
    useTestDc: config.telegram.useTestDc,
    tdlibParameters: {
      use_message_database: true,
      use_secret_chats: false,
      system_language_code: 'en',
      device_model: 'Desktop',
      application_version: '0.1.0',
    },
  });

  const messageHandler = new MessageHandler();

  // Set up update handlers
  client.on('update', async (update) => {
    if (update._ === 'updateNewMessage') {
      await messageHandler.handleNewMessage(client, update);
    }
  });

  // Error handling
  client.on('error', (error) => {
    logger.error({ error }, 'TDLib error');
  });

  try {
    // Connect to Telegram
    logger.info('Connecting to Telegram...');
    await client.connect();
    logger.info('Connected successfully');

    // Log metrics periodically
    setInterval(() => {
      const metrics = messageHandler.getMetrics();
      logger.info({ metrics }, 'Current metrics');
    }, 60000); // Every minute

  } catch (error) {
    logger.error({ error }, 'Failed to connect to Telegram');
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    const metrics = messageHandler.getMetrics();
    logger.info({ metrics }, 'Final metrics');
    await client.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    const metrics = messageHandler.getMetrics();
    logger.info({ metrics }, 'Final metrics');
    await client.close();
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error({ 
    error,
    message: error?.message,
    stack: error?.stack,
    type: typeof error,
    stringified: String(error)
  }, 'Unhandled error');
  process.exit(1);
});

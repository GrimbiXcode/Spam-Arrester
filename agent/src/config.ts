import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config({ path: join(__dirname, '../../.env') });

interface Config {
  telegram: {
    apiId: number;
    apiHash: string;
    phoneNumber?: string;
    databaseDirectory: string;
    filesDirectory: string;
    useTestDc: boolean;
    logVerbosityLevel: number;
  };
  thresholds: {
    lowThreshold: number;
    actionThreshold: number;
    vectorSimilarityCutoff: number;
  };
  rateLimits: {
    maxDeletesPerMinute: number;
    maxBlocksPerMinute: number;
  };
  detection: {
    checkContacts: boolean;
    checkCommonGroups: boolean;
    checkProfilePhoto: boolean;
    checkLinks: boolean;
    checkPhoneNumbers: boolean;
  };
  actions: {
    defaultAction: 'archive' | 'delete' | 'log' | 'block';
    enableBlocking: boolean;
    enableDeletion: boolean;
    removeFromChatList: boolean;
    revokeMessages: boolean;
  };
  logging: {
    level: string;
  };
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

function normalizeAction(value: string | undefined, fallback: Config['actions']['defaultAction']) {
  if (!value) return fallback;
  const normalized = value.toLowerCase();
  if (normalized === 'archive' || normalized === 'log' || normalized === 'delete' || normalized === 'block') {
    return normalized as Config['actions']['defaultAction'];
  }
  return fallback;
}

function loadConfig(): Config {
  // In Docker, config is mounted at /app/config; otherwise use relative path
  const configPath = process.env.CONFIG_PATH || join(__dirname, '../../config/default.json');
  const configFile = JSON.parse(readFileSync(configPath, 'utf-8'));

  const apiId = process.env.TG_API_ID;
  const apiHash = process.env.TG_API_HASH;

  if (!apiId || !apiHash) {
    throw new Error('TG_API_ID and TG_API_HASH must be set in environment variables');
  }

  const thresholds = {
    ...configFile.thresholds,
    lowThreshold: readNumber(process.env.LOW_THRESHOLD, configFile.thresholds.lowThreshold),
    actionThreshold: readNumber(process.env.ACTION_THRESHOLD, configFile.thresholds.actionThreshold),
    vectorSimilarityCutoff: readNumber(
      process.env.VECTOR_SIMILARITY_CUTOFF,
      configFile.thresholds.vectorSimilarityCutoff
    ),
  };

  const actions = {
    ...configFile.actions,
    defaultAction: normalizeAction(process.env.DEFAULT_ACTION, configFile.actions.defaultAction),
    enableDeletion: readBoolean(process.env.ENABLE_DELETION, configFile.actions.enableDeletion),
    enableBlocking: readBoolean(process.env.ENABLE_BLOCKING, configFile.actions.enableBlocking),
    removeFromChatList: readBoolean(process.env.REMOVE_FROM_CHAT_LIST, configFile.actions.removeFromChatList),
    revokeMessages: readBoolean(process.env.REVOKE_MESSAGES, configFile.actions.revokeMessages),
  };

  return {
    telegram: {
      apiId: parseInt(apiId, 10),
      apiHash,
      phoneNumber: process.env.TG_PHONE_NUMBER,
      ...configFile.tdlib,
    },
    thresholds,
    rateLimits: configFile.rateLimits,
    detection: configFile.detection,
    actions,
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
  };
}

export const config = loadConfig();

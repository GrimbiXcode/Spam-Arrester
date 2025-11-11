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
    defaultAction: 'archive' | 'delete' | 'log';
    enableBlocking: boolean;
    enableDeletion: boolean;
    removeFromChatList: boolean;
    revokeMessages: boolean;
  };
  logging: {
    level: string;
  };
}

function loadConfig(): Config {
  const configPath = join(__dirname, '../../config/default.json');
  const configFile = JSON.parse(readFileSync(configPath, 'utf-8'));

  const apiId = process.env.TG_API_ID;
  const apiHash = process.env.TG_API_HASH;

  if (!apiId || !apiHash) {
    throw new Error('TG_API_ID and TG_API_HASH must be set in environment variables');
  }

  return {
    telegram: {
      apiId: parseInt(apiId, 10),
      apiHash,
      phoneNumber: process.env.TG_PHONE_NUMBER,
      ...configFile.tdlib,
    },
    thresholds: configFile.thresholds,
    rateLimits: configFile.rateLimits,
    detection: configFile.detection,
    actions: configFile.actions,
    logging: {
      level: process.env.LOG_LEVEL || 'info',
    },
  };
}

export const config = loadConfig();

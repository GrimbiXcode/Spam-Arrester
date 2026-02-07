export const defaultConfigTemplate = {
  thresholds: {
    lowThreshold: 0.3,
    actionThreshold: 0.85,
    vectorSimilarityCutoff: 0.9,
  },
  rateLimits: {
    maxDeletesPerMinute: 5,
    maxBlocksPerMinute: 10,
  },
  detection: {
    checkContacts: true,
    checkCommonGroups: true,
    checkProfilePhoto: true,
    checkLinks: true,
    checkPhoneNumbers: true,
  },
  actions: {
    defaultAction: 'log',
    enableBlocking: true,
    enableDeletion: false,
    removeFromChatList: true,
    revokeMessages: true,
  },
  tdlib: {
    databaseDirectory: './tdlib-data',
    filesDirectory: './tdlib-files',
    useTestDc: false,
    logVerbosityLevel: 2,
  },
} as const;

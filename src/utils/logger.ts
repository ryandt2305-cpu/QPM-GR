// src/utils/logger.ts
export interface Logger {
  (...args: any[]): void;
  enabled: boolean;
}

export function createLogger(prefix: string, enabledByDefault = true): Logger {
  const logger = ((...args: any[]) => {
    if (logger.enabled) {
      console.log(`[${prefix}]`, ...args);
    }
  }) as Logger;
  
  logger.enabled = enabledByDefault;
  return logger;
}

export const log = createLogger('QuinoaPetMgr');
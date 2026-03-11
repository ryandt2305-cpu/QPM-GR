// src/utils/logger.ts
import { readSharedGlobal, shareGlobal } from '../core/pageContext';

export interface Logger {
  (...args: any[]): void;
  enabled: boolean;
}

const VERBOSE_LOGS_FLAG = '__QPM_VERBOSE_LOGS';

export function isVerboseLogsEnabled(): boolean {
  return readSharedGlobal<boolean>(VERBOSE_LOGS_FLAG) === true;
}

export function setVerboseLogsEnabled(enabled: boolean): void {
  shareGlobal(VERBOSE_LOGS_FLAG, enabled);
}

export function createLogger(prefix: string, enabledByDefault = false): Logger {
  const logger = ((...args: any[]) => {
    if (logger.enabled || isVerboseLogsEnabled()) {
      console.log(`[${prefix}]`, ...args);
    }
  }) as Logger;
  
  logger.enabled = enabledByDefault;
  return logger;
}

export const log = createLogger('QuinoaPetMgr', false);
export const importantLog = createLogger('QuinoaPetMgr', true);

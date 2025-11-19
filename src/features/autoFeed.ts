// src/features/autoFeed.ts
// STUB FILE - Automation removed in General Release v5.0.0
// This file now only exports types and empty functions needed for tracking/display

export interface FeedStatEntry {
  count: number;
  lastFeed: number;
  lastBaseline: number | null;
  lastPostFeed: number | null;
  averageFill: number | null;
  averageDrainPerHour: number | null;
  fillSamples: number;
  drainSamples: number;
  lastFillAmount: number | null;
  lastDrainRate: number | null;
}

export interface FeedStats {
  [petName: string]: FeedStatEntry;
}

export type FeedRateSource = 'events' | 'model' | 'none';

export interface SessionStatsSummary {
  uptime: string;
  feedsPerHour: string;
  feedSampleCount: number;
  feedWindowMinutes: number;
  feedRateSource: FeedRateSource;
  modelPetSamples: number;
}

// Empty/stub implementations
export function getSessionStats(): SessionStatsSummary {
  return {
    uptime: '0s',
    feedsPerHour: '0.00',
    feedSampleCount: 0,
    feedWindowMinutes: 0,
    feedRateSource: 'none',
    modelPetSamples: 0,
  };
}

export function resetFeedSession(): void {
  // No-op in General Release
}

export function getFeedStats(): FeedStats {
  return {};
}

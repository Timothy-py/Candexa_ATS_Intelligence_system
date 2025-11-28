export enum JobQueues {
  SYNC_QUEUE = 'sync-connectors',
  RAW_EVENTS = 'raw-events',
  NORMALIZE = 'normalize-events',
}

export const JOB_NAMES = {
  FULL_SYNC: 'full-sync',
  DELTA_SYNC: 'delta-sync',
  RAW_APP_PAGE: 'raw-app-page',
  NORMALIZE_APPLICATION: 'normalize-application',
};
export type JobNames = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

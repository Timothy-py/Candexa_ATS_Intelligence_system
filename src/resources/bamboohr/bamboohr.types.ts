export interface NormalizedEvent {
  connectorId: string;
  provider: string; // bamboohr | greenhouse ...
  providerEventId: string;
  eventType: string; // e.g. 'stage_change'
  candidateExternalId?: string | null;
  jobExternalId?: string | null;
  stageFrom?: string | null;
  stageTo?: string | null;
  actor?: string | null;
  timestamp: string; // ISO
  metadata?: Record<string, any>;
  raw?: any;
}

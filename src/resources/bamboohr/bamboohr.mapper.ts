/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { NormalizedEvent } from './bamboohr.types';

export function mapApplicationToEvent(
  app: any,
  connectorId: string,
): NormalizedEvent {
  // Defensive normalization of timestamps
  const timestampRaw =
    app.updatedAt ?? app.createdAt ?? new Date().toISOString();
  const timestamp = new Date(timestampRaw).toISOString();

  // Stage mapping: provider stage names can be mapped here if needed.
  // For MVF we'll pass through the stage name but normalize casing
  const stageTo = app.currentStage ?? null;
  const stageFrom = app.previousStage ?? null;

  const providerEventId = String(app.id);

  const candidateExternalId = app.applicant?.id
    ? String(app.applicant.id)
    : app.applicantId
      ? String(app.applicantId)
      : null;
  const jobExternalId = app.job?.id
    ? String(app.job.id)
    : app.jobOpeningId
      ? String(app.jobOpeningId)
      : null;

  const actor = app.updatedBy ?? app.changedBy ?? null;

  const normalized: NormalizedEvent = {
    connectorId,
    provider: 'bamboohr',
    providerEventId,
    eventType: 'stage_change',
    candidateExternalId,
    jobExternalId,
    stageFrom,
    stageTo,
    actor,
    timestamp,
    metadata: {
      rating: app.rating ?? null,
      status: app.status ?? null,
      rawApplicationId: app.id ?? null,
    },
    raw: app,
  };

  return normalized;
}

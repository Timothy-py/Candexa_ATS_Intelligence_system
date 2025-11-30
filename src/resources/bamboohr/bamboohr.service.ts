/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BamboohrClient } from './bamboohr.client';
import { prisma } from 'src/core/database/database.service';
import { QueueService } from 'src/core/queue/queue.service';

@Injectable()
export class BamboohrService {
  private readonly logger = new Logger(BamboohrService.name);
  private readonly prisma = prisma;

  constructor(private readonly queueService: QueueService) {}

  /** Initialize BambooHR Client with correct keys */
  private async initClient(connectorId: string): Promise<BamboohrClient> {
    const connector = await this.prisma.atsConnector.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    if (!connector.subdomain) {
      throw new Error(`Connector subdomain is missing for: ${connectorId}`);
    }

    if (!connector.apiKey) {
      throw new Error(`Connector apiKey is missing for: ${connectorId}`);
    }

    return new BamboohrClient(connector.subdomain, connector.apiKey);
  }

  /**
   * Helper to normalize variable response shapes from BambooHR list endpoints.
   * BambooHR often returns either:
   *  - { data: [...] }
   *  - { applications: [...] }
   *  - array directly
   */
  private extractList<T = any>(resp: any): T[] {
    if (!resp) return [];
    if (Array.isArray(resp)) return resp;
    if (Array.isArray(resp.data)) return resp.data;
    // Some endpoints return top-level 'applications' or 'jobs'
    const keys = [
      'applications',
      'data',
      'jobs',
      'applicants',
      'items',
      'applications',
    ];
    for (const k of keys) {
      if (Array.isArray(resp[k])) return resp[k];
    }
    // If resp has `meta` and top-level `data` inside, try resp
    if (Array.isArray(resp?.result)) return resp.result;
    // Unknown shape — return empty
    return [];
  }

  /**
   * Generic paginated fetch for BambooHR list endpoints.
   * Uses cursor-based or page-limit style depending on returned meta.
   * For MVF we implement a simple loop that requests until no nextCursor or no nextPageUrl.
   */
  // private async fetchAllPages(path: string, params: any = {}) {
  //   const client: any = this.clientFromPath(path, params);
  //   const results: any[] = [];
  //   let afterCursor: string | null = null;
  //   let page = 1;
  //   // Attempt cursor-mode first, fallback to page increments
  //   while (true) {
  //     const reqParams = { ...params };
  //     if (afterCursor) {
  //       // cursor-based param common naming: page[after] or page[afterCursor] — try `page[after]`
  //       reqParams.page = { ...reqParams.page, after: afterCursor };
  //     } else {
  //       // page fallback
  //       reqParams.page = { ...reqParams.page, number: page, limit: 200 };
  //     }

  //     // Use client's apiGet (it will prefix /api/v1)
  //     const resp = await client.apiGet(path, reqParams).catch((err) => {
  //       this.logger.error(`Pagination request failed for ${path}`, err);
  //       throw err;
  //     });

  //     const list = this.extractList(resp);
  //     if (list.length) {
  //       results.push(...list);
  //     }

  //     // Try to detect cursor/next from known shapes
  //     const nextCursor =
  //       resp?.meta?.page?.nextCursor ??
  //       resp?.meta?.nextCursor ??
  //       resp?.nextPageUrl ??
  //       resp?.links?.next ??
  //       null;

  //     if (nextCursor) {
  //       // If it's a full URL (nextPageUrl), we cannot pass it to apiGet directly;
  //       // try to extract a cursor param from it — but for MVF, if nextPageUrl exists,
  //       // attempt one more server-side request by calling apiGet with no params and break to avoid infinite loops.
  //       // Safer approach: if nextCursor string looks like a URL, break and return results to avoid stuck loops.
  //       if (typeof nextCursor === 'string' && nextCursor.startsWith('http')) {
  //         this.logger.warn(
  //           `Received nextPageUrl (absolute) from BambooHR; fetched ${results.length} items and stopping. If you need full pagination, we should implement nextPageUrl parsing.`,
  //         );
  //         break;
  //       }

  //       afterCursor = String(nextCursor);
  //       page += 1;
  //       continue;
  //     }

  //     // No next cursor; break
  //     break;
  //   }

  //   return results;
  // }

  // Helper that returns a client (loads connector) for internal use
  // private clientFromPath(path: string, params?: any) {
  //   // path not used for client creation, but keep pattern
  //   // Returns an initialized client instance (wraps initClient but ignoring connectorId)
  //   // We will call initClient in the caller to obtain correct client per-connector.
  //   // This function exists to keep typing consistent in fetchAllPages; caller must pass client in practice.
  //   throw new Error(
  //     'clientFromPath should not be called directly. Use initClient(connectorId) and pass the client.',
  //   );
  // }

  /** ============================
   *  SYNC JOBS (ATS API)
   *  Endpoint: GET /api/v1/applicant_tracking/jobs
   * ============================ */
  async syncJobs(connectorId: string) {
    const client = await this.initClient(connectorId);

    // Use the public `getJobSummaries` helper
    const response = await client.getJobSummaries().catch((err) => {
      this.logger.error('Failed to fetch job summaries', err);
      throw err;
    });

    const jobs = this.extractList(response);

    for (const job of jobs) {
      console.log('Processing job:', job);
      // tolerate different field names (title vs jobOpeningName)
      const externalId = String(
        job.id ?? job.externalId ?? job.jobOpeningId ?? job.jobOpeningId,
      );
      const title =
        job?.title?.label ?? job?.postingTitle ?? job?.jobOpeningName ?? null;
      const department = job?.department?.label ?? null;
      const location = job?.location?.label ?? null;
      const status = job?.status?.label ?? null;
      const hiringTeam = job?.hiringTeam ?? job?.hiringLead ?? null;

      await this.prisma.atsJob.upsert({
        where: {
          externalJobId_connectorId: {
            externalJobId: externalId,
            connectorId,
          },
        },
        create: {
          connectorId,
          externalJobId: externalId,
          title,
          department,
          location,
          status,
          hiringTeam: hiringTeam ?? undefined,
          raw: job,
        },
        update: {
          title,
          department,
          location,
          status,
          hiringTeam: hiringTeam ?? undefined,
          raw: job,
        },
      });
    }

    this.logger.log(`Synced ${jobs.length} ATS job openings`);
    return jobs.length;
  }

  /** ============================
   *  SYNC CANDIDATES (derived from applications)
   *  Endpoint: GET /api/v1/applicant_tracking/applications
   *  We iterate applications pages and upsert unique applicants/candidates
   * ============================ */
  async syncCandidates(connectorId: string) {
    const client = await this.initClient(connectorId);

    const pageLimit = 200; // we keep this for internal pacing but not sent as page param
    let page = 1;
    const seenApplicantExternalIds = new Set<string>();
    let totalSynced = 0;

    while (true) {
      // IMPORTANT: per OpenAPI, `page` is a simple integer (page number)
      const params = { page }; // no nested object

      const resp = await client.getApplications(params).catch((err) => {
        this.logger.error('Failed to fetch applications page', {
          connectorId,
          page,
          err,
        });
        throw err;
      });

      const apps = this.extractList(resp);
      if (!apps || apps.length === 0) {
        this.logger.debug(`No applications returned for page ${page}`);
        break;
      }

      for (const app of apps) {
        const applicant = app?.applicant ?? app?.applicantDetails ?? null;
        if (!applicant) continue;

        const applicantExternalId = String(
          applicant.id ?? applicant.applicantId ?? app.applicantId ?? '',
        );
        if (!applicantExternalId) continue;
        if (seenApplicantExternalIds.has(applicantExternalId)) continue;
        seenApplicantExternalIds.add(applicantExternalId);

        const fullName =
          `${applicant.firstName ?? ''} ${applicant.lastName ?? ''}`.trim();

        await this.prisma.atsCandidate.upsert({
          where: {
            externalCandidateId_connectorId: {
              externalCandidateId: applicantExternalId,
              connectorId,
            },
          },
          create: {
            connectorId,
            externalCandidateId: applicantExternalId,
            fullName,
            email: applicant.email ?? null,
            phone: applicant.phone ?? null,
            source: applicant.source ?? app.source ?? null,
            raw: applicant,
          },
          update: {
            fullName,
            email: applicant.email ?? null,
            phone: applicant.phone ?? null,
            source: applicant.source ?? app.source ?? null,
            raw: applicant,
          },
        });

        totalSynced++;
      }

      // Stop condition: check paginationComplete (per spec) OR no next page and smaller page size
      const paginationComplete =
        resp?.paginationComplete ?? resp?.meta?.paginationComplete ?? null;
      const nextPageUrl = resp?.nextPageUrl ?? resp?.links?.next ?? null;

      if (paginationComplete === true) {
        this.logger.debug(
          'BambooHR indicates paginationComplete=true — stopping pagination.',
        );
        break;
      }

      // If API returned an absolute nextPageUrl, be conservative and stop (or implement nextPageUrl fetching)
      if (
        nextPageUrl &&
        typeof nextPageUrl === 'string' &&
        nextPageUrl.startsWith('http')
      ) {
        this.logger.warn(
          'Received nextPageUrl (absolute). Stopping after current page; implement nextPageUrl parsing if you need full traversal.',
        );
        break;
      }

      // If the returned result count is less than some safe per-page guess, we assume last page
      if (apps.length < pageLimit) break;

      page += 1;
    }

    this.logger.log(`Synced ${totalSynced} unique applicants as AtsCandidates`);
    return totalSynced;
  }

  /** ============================
   *  SYNC APPLICATION EVENTS (from applications endpoint)
   *  Endpoint: GET /api/v1/applicant_tracking/applications
   *  For each application we create/normalize event rows via EventNormalizerService
   * ============================ */
  async syncCandidateEvents(connectorId: string) {
    const client = await this.initClient(connectorId);

    const pageLimit = 200;
    let page = 1;
    let pagesEnqueued = 0;
    let totalApplications = 0;

    while (true) {
      const params = { page }; // BambooHR expects simple integer page param
      const resp = await client.getApplications(params).catch((err) => {
        this.logger.error('Failed to fetch applications for events', {
          connectorId,
          page,
          err,
        });
        throw err;
      });

      const apps = this.extractList(resp);
      if (!apps || apps.length === 0) {
        break;
      }

      // Enqueue raw page for background processing
      try {
        await this.queueService.addRawEventsPage(connectorId, page, apps);
        pagesEnqueued++;
        totalApplications += apps.length;
        this.logger.log(
          `Enqueued raw-events page ${page} (count=${apps.length}) for connector ${connectorId}`,
        );
      } catch (err) {
        this.logger.error('Failed to enqueue raw-events page', {
          connectorId,
          page,
          err,
        });
        // Continue — don't break the entire sync for a single enqueue failure
      }

      const paginationComplete =
        resp?.paginationComplete ?? resp?.meta?.paginationComplete ?? null;
      const nextPageUrl = resp?.nextPageUrl ?? resp?.links?.next ?? null;

      if (paginationComplete === true) {
        this.logger.debug(
          'BambooHR indicates paginationComplete=true — stopping pagination.',
        );
        break;
      }

      if (
        nextPageUrl &&
        typeof nextPageUrl === 'string' &&
        nextPageUrl.startsWith('http')
      ) {
        this.logger.warn(
          'BambooHR returned nextPageUrl (absolute) — stopping pagination after current page for safety.',
        );
        break;
      }

      if (apps.length < pageLimit) break;
      page += 1;
    }

    this.logger.log(
      `Enqueued ${pagesEnqueued} raw event pages (total applications: ${totalApplications}) for connector ${connectorId}`,
    );
    return { pagesEnqueued, totalApplications };
  }

  /** Resolve canonical internal jobId from provider external ID */
  // private async resolveJobId(
  //   externalJobId: number | string,
  //   connectorId: string,
  // ) {
  //   if (!externalJobId) return null;
  //   const job = await this.prisma.atsJob.findUnique({
  //     where: {
  //       externalJobId_connectorId: {
  //         externalJobId: String(externalJobId),
  //         connectorId,
  //       },
  //     },
  //   });

  //   return job ? job.id : null;
  // }

  async testConnection(connectorId: string) {
    // 1. Load connector config
    const connector = await this.prisma.atsConnector.findUnique({
      where: { id: connectorId },
    });

    if (!connector) {
      throw new NotFoundException(`Connector not found: ${connectorId}`);
    }

    if (!connector.subdomain || !connector.apiKey) {
      throw new BadRequestException(
        'Connector is missing required BambooHR credentials (subdomain/apiKey)',
      );
    }

    // 2. Build client instance
    const client = new BamboohrClient(connector.subdomain, connector.apiKey);

    // 3. Call a safe endpoint for validation (employees list)
    try {
      // This calls GET /api/v1/employees
      await client.apiGet('/employees');

      // 4. Update status → connected
      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: {
          status: 'connected',
          updatedAt: new Date(),
        },
      });

      return {
        ok: true,
        status: 'connected',
        message: 'Successfully connected to BambooHR',
      };
    } catch (err: any) {
      this.logger.error(
        `BambooHR connection test failed for connector ${connectorId}: ${err.message}`,
      );
      const status = err.response?.status;

      let reason = 'Unknown error communicating with BambooHR';

      if (status === 401) reason = 'Invalid or unauthorized API Key';
      if (status === 403)
        reason = 'Insufficient BambooHR permissions or ATS access not enabled';
      if (status === 404) reason = 'Invalid subdomain or endpoint not found';
      if (status === 500) reason = 'BambooHR internal error';
      if (status === 503) reason = 'BambooHR is temporarily unavailable';
      if (err.code === 'ENOTFOUND')
        reason = 'DNS resolution failed (wrong subdomain)';
      if (err.code === 'ECONNRESET') reason = 'Connection reset by BambooHR';
      if (err.code === 'ETIMEDOUT') reason = 'Connection timed out';

      // Update DB status → error
      await this.prisma.atsConnector.update({
        where: { id: connectorId },
        data: {
          status: 'error',
          updatedAt: new Date(),
        },
      });

      return {
        ok: false,
        status: 'error',
        message: reason,
        raw: err.message,
      };
    }
  }
}

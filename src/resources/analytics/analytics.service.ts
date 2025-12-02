/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, Logger } from '@nestjs/common';
import { prisma } from 'src/core/database/database.service';

/**
 * AnalyticsService
 *
 * Provides heatmap, drilldown and job-level stats for the dashboard.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly prisma = prisma;

  /**
   * Get stage-level heatmap for a job.
   * Returns array of { stageName, candidateCount, avgDurationHours, delaySeverity }
   */
  async getJobHeatmap(jobId: string, connectorId: string) {
    if (!jobId || !connectorId) return [];

    // 1) Get counts per currentStage from AtsCandidate using Prisma groupBy
    const groups = await this.prisma.atsCandidate.groupBy({
      by: ['currentStage'],
      where: {
        jobId,
        connectorId,
      },
      _count: {
        _all: true,
      },
    });

    // 2) Load stage metrics (avg durations + severity) for the job
    const metrics = await this.prisma.atsStageMetric.findMany({
      where: { jobId, connectorId },
    });

    // 3) Merge results
    const result = groups.map((g) => {
      const stageName = g.currentStage ?? 'Unknown';
      const metric = metrics.find((m) => m.stageName === g.currentStage);
      return {
        stageName,
        candidateCount: Number(g._count._all ?? 0),
        avgDurationHours: metric?.avgDurationHours ?? null,
        totalDurationHours: metric?.totalDurationHours ?? null,
        delaySeverity: metric?.delaySeverity ?? null,
      };
    });

    // Ensure we include metric-only stages (stages that exist in metrics but currently 0 candidates)
    for (const m of metrics) {
      if (!result.find((r) => r.stageName === m.stageName)) {
        result.push({
          stageName: m.stageName,
          candidateCount: 0,
          avgDurationHours: m.avgDurationHours ?? null,
          totalDurationHours: m.totalDurationHours ?? null,
          delaySeverity: m.delaySeverity ?? null,
        });
      }
    }

    // Sort by candidateCount desc for predictable ordering
    result.sort((a, b) => b.candidateCount - a.candidateCount);
    return result;
  }

  /**
   * Candidate drilldown for a given jobId + stageName.
   * Supports pagination and filters (severity, ageDays, search).
   *
   * Returns { items: Candidate[], total, page, pageSize }
   */
  async getCandidatesForStage(args: {
    jobId: string;
    connectorId: string;
    stageName: string | null;
    page?: number;
    pageSize?: number;
    severity?: string | null;
    ageDays?: number | null;
    search?: string | null;
  }) {
    const {
      jobId,
      connectorId,
      stageName,
      page = 1,
      pageSize = 25,
      severity,
      ageDays,
      search,
    } = args;

    const where: any = {
      jobId,
      connectorId,
    };

    // stage filter (null/Unknown handling)
    if (stageName && stageName.toLowerCase() !== 'unknown') {
      where.currentStage = stageName;
    } else if (stageName && stageName.toLowerCase() === 'unknown') {
      where.currentStage = null;
    }

    // search filter (name / email)
    if (search && search.trim().length) {
      const q = `%${search.trim().toLowerCase()}%`;
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // ageDays filter (candidates whose lastEventAt older than X days)
    if (typeof ageDays === 'number' && ageDays >= 0) {
      const cutoff = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000);
      where.lastEventAt = { lte: cutoff };
    }

    // severity filter: join on AtsIssue severity. We'll fetch candidate IDs with issues matching severity and filter by them.
    let candidateIdsFilter: string[] | null = null;
    if (severity) {
      const issues = await this.prisma.atsIssue.findMany({
        where: {
          connectorId,
          jobId,
          severity: severity as any,
          resolved: false,
        },
        select: { candidateId: true },
        distinct: ['candidateId'],
      });
      candidateIdsFilter = issues.map((i) => i.candidateId);
      if (candidateIdsFilter.length === 0) {
        // no matches; return empty page
        return { items: [], total: 0, page, pageSize };
      }
      where.id = { in: candidateIdsFilter };
    }

    // Count total
    const total = await this.prisma.atsCandidate.count({ where });

    // Fetch paginated candidates and also include open issues count / top issue
    const items = await this.prisma.atsCandidate.findMany({
      where,
      orderBy: { lastEventAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        currentStage: true,
        lastEventAt: true,
        externalCandidateId: true,
        raw: true,
        atsIssues: {
          where: { resolved: false },
          select: {
            id: true,
            issueType: true,
            severity: true,
            description: true,
            detectedAt: true,
          },
          take: 5,
        },
      },
    });

    // Convert to DTO-friendly format
    const formatted = items.map((c) => ({
      id: c.id,
      fullName: c.fullName,
      email: c.email,
      phone: c.phone,
      currentStage: c.currentStage,
      lastEventAt: c.lastEventAt,
      externalCandidateId: c.externalCandidateId,
      raw: c.raw,
      issues: c.atsIssues ?? [],
    }));

    return { items: formatted, total, page, pageSize };
  }

  /**
   * Job-level stats for overview panel.
   * Returns totals: totalApplications, pipelineMovement (recent transitions), avgTimeInPipeline (hours), fairness metrics placeholder.
   */
  async getJobStats(jobId: string, connectorId: string) {
    if (!jobId || !connectorId) return null;

    // total applications
    const totalApplications = await this.prisma.atsCandidate.count({
      where: { jobId, connectorId },
    });

    // pipeline movement: number moved in last 7 days (count of events)
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const moved = await this.prisma.atsCandidateEvent.count({
      where: {
        jobId,
        connectorId,
        timestamp: { gte: since },
        type: 'stage_change',
      },
    });

    // avg time in pipeline: approximate using stage metrics avg + count weighted or compute per candidate
    // For MVF: compute avg time from first event -> last event per candidate for candidates in job (sampled)
    const sample = await this.prisma.$queryRaw<
      Array<{ diff_hours: number }>
    >`SELECT AVG(EXTRACT(EPOCH FROM (max_ts - min_ts)))/3600 as diff_hours FROM (
        SELECT "candidateId", MIN("timestamp") as min_ts, MAX("timestamp") as max_ts
        FROM "AtsCandidateEvent"
        WHERE "jobId" = ${jobId} AND "connectorId" = ${connectorId}
        GROUP BY "candidateId"
    ) q`;

    const avgTimeInPipelineHours = sample?.[0]?.diff_hours
      ? Number(sample[0].diff_hours)
      : null;

    // fairness / talk-time placeholder: requires interview transcripts (not in ATS events), return null for now
    const fairness = { talkTimeImbalance: null };

    return {
      jobId,
      connectorId,
      totalApplications,
      pipelineMovementLast7d: Number(moved),
      avgTimeInPipelineHours,
      fairness,
    };
  }
}

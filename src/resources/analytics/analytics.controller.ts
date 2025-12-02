import {
  Controller,
  Get,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';

@Controller('ats')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('jobs/:id/heatmap')
  @ApiOperation({ summary: 'Get heatmap for a job' })
  @ApiParam({ name: 'id', description: 'Internal job id (AtsJob.id)' })
  async getHeatmap(
    @Param('id') jobId: string,
    @Query('connectorId') connectorId: string,
  ) {
    return this.analytics.getJobHeatmap(jobId, connectorId);
  }

  @Get('jobs/:id/stage/:name/candidates')
  @ApiOperation({ summary: 'Get candidates for a job stage (drilldown)' })
  @ApiParam({ name: 'id', description: 'Internal job id (AtsJob.id)' })
  @ApiParam({ name: 'name', description: 'Stage name or "Unknown"' })
  @ApiQuery({ name: 'connectorId', required: true })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiQuery({ name: 'severity', required: false })
  @ApiQuery({ name: 'ageDays', required: false })
  @ApiQuery({ name: 'search', required: false })
  async getStageCandidates(
    @Param('id') jobId: string,
    @Param('name') stageName: string,
    @Query('connectorId') connectorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('severity') severity?: string,
    @Query('ageDays', new DefaultValuePipe(null)) ageDays?: number,
    @Query('search') search?: string,
  ) {
    const res = await this.analytics.getCandidatesForStage({
      jobId,
      connectorId,
      stageName,
      page,
      pageSize,
      severity,
      ageDays,
      search,
    });
    return res;
  }

  @Get('jobs/:id/stats')
  @ApiOperation({ summary: 'Get job-level stats for overview' })
  @ApiParam({ name: 'id', description: 'Internal job id (AtsJob.id)' })
  @ApiQuery({ name: 'connectorId', required: true })
  async getJobStats(
    @Param('id') jobId: string,
    @Query('connectorId') connectorId: string,
  ) {
    return this.analytics.getJobStats(jobId, connectorId);
  }
}

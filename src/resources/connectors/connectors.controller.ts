import {
  Controller,
  Get,
  Param,
  HttpException,
  HttpStatus,
  ParseBoolPipe,
  Query,
} from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { BamboohrService } from '../bamboohr/bamboohr.service';
import { ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';

@Controller('connectors')
export class ConnectorsController {
  constructor(
    private readonly connectors: ConnectorsService,
    private readonly bamboo: BamboohrService,
  ) {}

  /**
   * GET /connectors/:id/test
   * Runs a live connection test for the connector.
   */
  @ApiOperation({
    summary: 'Test connector connection',
    description: 'Runs a live connection test for the specified connector ID.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the connector to test',
    required: true,
  })
  @Get(':id/test')
  async testConnection(@Param('id') connectorId: string) {
    console.log('Testing connection for connector ID:', connectorId);
    if (!connectorId) {
      throw new HttpException(
        'Connector ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.bamboo.testConnection(connectorId);

    // If the service returns ok: false, we still send 200
    // but with a structured payload indicating the failure reason.
    return {
      connectorId,
      ok: result.ok,
      status: result.status,
      message: result.message,
      raw: result.raw || null,
      timestamp: new Date(),
    };
  }

  /**
   * GET /connectors/:id/full-sync
   * Executes a full sync immediately, default enqueues a background job.
   * Query param: ?runInline=true to run synchronously (blocking).
   */
  @ApiOperation({
    summary: 'Trigger full sync for connector',
    description:
      'Starts a full sync for the connector. By default this enqueues a background job. Use ?runInline=true to run inline (blocking).',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the connector to sync',
    required: true,
  })
  @ApiQuery({
    name: 'runInline',
    required: false,
    type: Boolean,
    description: 'If true, run the sync inline (blocking) instead of enqueuing',
  })
  @Get(':id/full-sync')
  async runFullSync(
    @Param('id') connectorId: string,
    @Query('runInline', new ParseBoolPipe({ optional: true }))
    runInline = false,
  ) {
    if (!connectorId) {
      throw new HttpException(
        'Connector ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.connectors.fullSync(connectorId, runInline);

    // If enqueued, connectors.fullSync returns { queued: true, jobId }
    // If inline, it returns the sync summary
    return {
      connectorId,
      ok: true,
      result,
      timestamp: new Date(),
    };
  }

  /**
   * GET /connectors/:id/delta-sync
   * Executes a delta sync. By default runs inline; pass ?enqueue=true to enqueue as a background job.
   */
  @ApiOperation({
    summary: 'Trigger delta sync for connector',
    description:
      'Starts a delta sync for the connector. By default this runs inline. Use ?enqueue=true to enqueue a background job.',
  })
  @ApiParam({
    name: 'id',
    description: 'The ID of the connector to delta-sync',
    required: true,
  })
  @ApiQuery({
    name: 'enqueue',
    required: false,
    type: Boolean,
    description: 'If true, enqueue the delta sync as a background job',
  })
  @Get(':id/delta-sync')
  async runDeltaSync(
    @Param('id') connectorId: string,
    @Query('enqueue', new ParseBoolPipe({ optional: true })) enqueue = false,
  ) {
    if (!connectorId) {
      throw new HttpException(
        'Connector ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.connectors.deltaSync(connectorId, enqueue);

    return {
      connectorId,
      ok: true,
      result,
      timestamp: new Date(),
    };
  }
}

import {
  Controller,
  Get,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConnectorsService } from './connectors.service';
import { BamboohrService } from '../bamboohr/bamboohr.service';
import { ApiOperation, ApiParam } from '@nestjs/swagger';

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
   * Executes a full sync immediately.
   */
  @Get(':id/full-sync')
  async runFullSync(@Param('id') connectorId: string) {
    if (!connectorId) {
      throw new HttpException(
        'Connector ID is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.connectors.fullSync(connectorId);

    return {
      connectorId,
      ok: true,
      message: 'Full sync completed successfully',
      timestamp: new Date(),
    };
  }
}

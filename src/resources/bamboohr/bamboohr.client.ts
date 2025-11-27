/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class BamboohrClient {
  private readonly logger = new Logger(BamboohrClient.name);
  private readonly client: AxiosInstance; // unified client for api/v1 surface

  /**
   * @param subdomain - the company subdomain (e.g. 'acme' for acme.bamboohr.com)
   * @param apiKey - BambooHR API key (used for Basic Auth across api/v1)
   */
  constructor(
    private readonly subdomain: string,
    private readonly apiKey: string,
  ) {
    if (!subdomain) {
      throw new Error('BamboohrClient requires a subdomain');
    }
    if (!apiKey) {
      throw new Error('BamboohrClient requires an apiKey');
    }

    // Use the documented server: https://{companyDomain}.bamboohr.com
    // All public API + applicant tracking endpoints are under /api/v1/...
    const baseURL = `https://${subdomain}.bamboohr.com`;

    this.client = axios.create({
      baseURL,
      auth: { username: apiKey, password: 'x' }, // documented basic auth pattern
      headers: {
        Accept: 'application/json',
      },
      timeout: 15000,
    });
  }

  /** Unified retry wrapper with exponential-ish backoff for transient failures */
  private async safeRequest<T>(config: any): Promise<T> {
    let attempt = 0;
    const maxRetries = 4;

    while (attempt < maxRetries) {
      try {
        const response = await this.client.request<T>(config);
        return response.data;
      } catch (err: any) {
        const status = err?.response?.status;

        // Throttling or temporary service issues: 429, 503
        if (status === 429 || status === 503) {
          const delay = Math.min(5000, (attempt + 1) * 1000);
          this.logger.warn(
            `BambooHR throttle/service (${status}). Retry attempt ${attempt + 1} in ${delay}ms`,
          );
          await new Promise((res) => setTimeout(res, delay));
          attempt++;
          continue;
        }

        // Common network instability transient codes
        if (
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'EAI_AGAIN'
        ) {
          const delay = (attempt + 1) * 800;
          this.logger.warn(
            `Network error (${err.code}). Retrying attempt ${attempt + 1} in ${delay}ms`,
          );
          await new Promise((res) => setTimeout(res, delay));
          attempt++;
          continue;
        }

        // Non-transient — log rich info and rethrow
        this.logger.error('BambooHR Request Error', {
          message: err.message,
          status: err.response?.status,
          headers: err.response?.headers,
          body: err.response?.data,
          config: {
            method: config.method,
            url: config.url,
            params: config.params,
          },
        });

        throw err;
      }
    }

    throw new Error('Request failed after max retries');
  }

  // Generic helper for GET against api/v1 endpoints
  async apiGet<T>(path: string, params?: any): Promise<T> {
    const config = {
      method: 'GET',
      url: path.startsWith('/api/v1') ? path : `/api/v1${path}`,
      params,
    };
    return this.safeRequest<T>(config);
  }

  // Generic helper for POST against api/v1 endpoints
  async apiPost<T>(path: string, body?: any, params?: any): Promise<T> {
    const config = {
      method: 'POST',
      url: path.startsWith('/api/v1') ? path : `/api/v1${path}`,
      data: body,
      params,
    };
    return this.safeRequest<T>(config);
  }

  // Convenience methods mapped to Applicant Tracking endpoints (per OpenAPI)
  //  - Get Job Summaries: GET /api/v1/applicant_tracking/jobs
  async getJobSummaries(params?: Record<string, any>): Promise<any> {
    return this.apiGet('/applicant_tracking/jobs', params);
  }

  //  - Get Job Openings (create/list endpoints use /applicant_tracking/job_opening)
  async getJobOpenings(params?: Record<string, any>): Promise<any> {
    return this.apiGet('/applicant_tracking/job_opening', params);
  }

  //  - Get Applications: GET /api/v1/applicant_tracking/applications
  async getApplications(params?: Record<string, any>): Promise<any> {
    return this.apiGet('/applicant_tracking/applications', params);
  }

  //  - Get a single Application: GET /api/v1/applicant_tracking/applications/{applicationId}
  async getApplicationById(applicationId: number | string): Promise<any> {
    return this.apiGet(`/applicant_tracking/applications/${applicationId}`);
  }

  //  - Get Applicant Statuses: GET /api/v1/applicant_tracking/statuses
  async getApplicantStatuses(): Promise<any> {
    return this.apiGet('/applicant_tracking/statuses');
  }

  //  - Generic fallback to core gateway.php endpoints if needed (legacy)
  async gatewayGet<T>(path: string, params?: any): Promise<T> {
    // Normalise path to include /api/gateway.php/{subdomain}/v1 if provided as relative
    const gatewayPath = path.startsWith('/api/gateway.php')
      ? path
      : `/api/gateway.php/${this.client.defaults.baseURL?.toString().split('://')[1]?.split('.')[0] ?? ''}/v1${path}`;
    const config = { method: 'GET', url: gatewayPath, params };
    return this.safeRequest<T>(config);
  }

  // Expose underlying axios instance for any ad-hoc needs (rare)
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

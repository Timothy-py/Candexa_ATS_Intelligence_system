/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

@Injectable()
export class BamboohrClient {
  private readonly logger = new Logger(BamboohrClient.name);
  private client: AxiosInstance; // unified client for api/v1 surface
  private readonly baseURL: string;

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
    this.baseURL = `https://${subdomain}.bamboohr.com`;

    // Create initial axios instance with conservative TLS options
    this.client = this.createAxiosInstance({
      keepAlive: true,
      timeoutMs: 15000,
    });
  }

  /**
   * Create a configured axios instance.
   * We expose keepAlive control so that when encountering TLS record errors
   * we can re-create the agent with keepAlive: false to avoid reused sockets.
   */
  private createAxiosInstance(opts?: {
    keepAlive?: boolean;
    timeoutMs?: number;
  }): AxiosInstance {
    const keepAlive = opts?.keepAlive ?? true;
    const timeoutMs = opts?.timeoutMs ?? 15000;

    const httpsAgent = new https.Agent({
      keepAlive,
      // enforce modern TLS
      minVersion: 'TLSv1.2',
      // maxVersion: 'TLSv1.3', // optional
    });

    return axios.create({
      baseURL: this.baseURL,
      auth: { username: this.apiKey, password: 'x' },
      headers: {
        Accept: 'application/json',
      },
      timeout: timeoutMs,
      httpsAgent,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  /** Determine if error is likely TLS/SSL/socket related and worth retrying */
  private isSslOrNetworkFailure(err: any) {
    if (!err) return false;
    const sslCodes = new Set([
      'ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC',
      'ERR_SSL_PROTOCOL_ERROR',
      'ECONNRESET',
      'ERR_TLS_CERT_ALTNAME_INVALID',
      'ENETDOWN',
      'EPIPE',
      'ENOTFOUND',
      'EAI_AGAIN',
    ]);
    if (err.code && sslCodes.has(err.code)) return true;
    // axios wraps some errors; check message too
    const msg = String(err?.message ?? '').toLowerCase();
    if (
      msg.includes('ssl') ||
      msg.includes('tls') ||
      msg.includes('bad record mac') ||
      msg.includes('handshake')
    ) {
      return true;
    }
    return false;
  }

  /** Unified retry wrapper with exponential-ish backoff for transient failures */
  private async safeRequest<T>(config: any): Promise<T> {
    let attempt = 0;
    const maxRetries = 5;

    while (attempt < maxRetries) {
      try {
        const response = await this.client.request<T>(config);
        return response.data;
      } catch (err: any) {
        const status = err?.response?.status;

        // HTTP-level throttling / temporary server errors
        if (status === 429 || status === 503) {
          const delay = Math.min(8000, (attempt + 1) * 1000);
          this.logger.warn(
            `BambooHR throttle/service (${status}). Retry attempt ${attempt + 1} in ${delay}ms`,
          );
          await new Promise((res) => setTimeout(res, delay));
          attempt++;
          continue;
        }

        // Transient network or TLS issues — retry with backoff and try re-creating agent with keepAlive:false on retry
        if (
          err.code === 'ECONNRESET' ||
          err.code === 'ETIMEDOUT' ||
          err.code === 'EAI_AGAIN' ||
          this.isSslOrNetworkFailure(err)
        ) {
          const delay = Math.pow(2, attempt) * 500;
          this.logger.warn(
            `Network/SSL error (${err.code ?? err.message}). Retry attempt ${attempt + 1} in ${delay}ms`,
          );
          await new Promise((res) => setTimeout(res, delay));

          // On second+ attempts, switch to an agent that disables keepAlive (avoid reusing possibly corrupted sockets)
          try {
            if (attempt >= 0) {
              // recreate axios instance using keepAlive: false to avoid reused sockets
              this.client = this.createAxiosInstance({
                keepAlive: false,
                timeoutMs: Math.max(
                  15000,
                  this.client.defaults.timeout as number,
                ),
              });
              this.logger.debug(
                'Recreated axios instance with keepAlive:false to mitigate socket/TLS issues',
              );
            }
          } catch (recreateErr) {
            this.logger.warn(
              'Failed to recreate axios instance for retry',
              recreateErr?.message ?? recreateErr,
            );
          }

          attempt++;
          continue;
        }

        // Non-transient — log rich info and rethrow
        this.logger.error('BambooHR Request Error', {
          message: err?.message,
          code: err?.code,
          status: err?.response?.status,
          headers: err?.response?.headers,
          body: err?.response?.data,
          config: {
            method: String(config.method).toUpperCase(),
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
    const url = path.startsWith('/api/v1')
      ? path
      : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
    const config = {
      method: 'GET',
      url,
      params,
    };
    return this.safeRequest<T>(config);
  }

  // Generic helper for POST against api/v1 endpoints
  async apiPost<T>(path: string, body?: any, params?: any): Promise<T> {
    const url = path.startsWith('/api/v1')
      ? path
      : `/api/v1${path.startsWith('/') ? path : `/${path}`}`;
    const config = {
      method: 'POST',
      url,
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

  //  - Get Job Openings
  async getJobOpenings(params?: Record<string, any>): Promise<any> {
    return this.apiGet('/applicant_tracking/job_opening', params);
  }

  //  - Get Applications
  async getApplications(params?: Record<string, any>): Promise<any> {
    return this.apiGet('/applicant_tracking/applications', params);
  }

  //  - Get a single Application
  async getApplicationById(applicationId: number | string): Promise<any> {
    return this.apiGet(`/applicant_tracking/applications/${applicationId}`);
  }

  //  - Get Applicant Statuses
  async getApplicantStatuses(): Promise<any> {
    return this.apiGet('/applicant_tracking/statuses');
  }

  //  - Generic fallback to core gateway.php endpoints if needed (legacy)
  async gatewayGet<T>(path: string, params?: any): Promise<T> {
    // Normalise path to include /api/gateway.php/{subdomain}/v1 if provided as relative
    const gatewayPath = path.startsWith('/api/gateway.php')
      ? path
      : `/api/gateway.php/${this.subdomain}/v1${path.startsWith('/') ? path : `/${path}`}`;
    const config = { method: 'GET', url: gatewayPath, params };
    return this.safeRequest<T>(config);
  }

  // Expose underlying axios instance for any ad-hoc needs (rare)
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }
}

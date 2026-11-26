import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { CompressionResult, S3Credentials, S3Options } from '../../../shared/contracts';

interface ClientOptions {
  region: string;
  credentials: S3Credentials;
  ignoreConfiguredEndpointUrls: true;
  maxAttempts: number;
}
interface S3Transport { send(command: PutObjectCommand): Promise<unknown>; destroy(): void }
interface Dependencies {
  getOptions(): S3Options;
  getCredentials(): S3Credentials | null;
  clientFactory?(options: ClientOptions): S3Transport;
}
export interface StoredObject { bucket: string; key: string; location: string }

function options(input: S3Options): S3Options {
  if (typeof input.region !== 'string' || typeof input.bucket !== 'string' || typeof input.prefix !== 'string') throw new Error('error.s3Config');
  const region = input.region.trim();
  const bucket = input.bucket.trim();
  const rawPrefix = input.prefix.trim();
  const prefix = rawPrefix.replace(/\/+$/, '');
  if (region.length > 63 || !/^[a-z]{2,8}(?:-[a-z0-9]+)+-\d+$/.test(region) ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') || /^\d+\.\d+\.\d+\.\d+$/.test(bucket) ||
      /^(?:xn--|sthree-|amzn-s3-demo-)/.test(bucket) || /(?:-s3alias|--ol-s3|\.mrap|--x-s3|--table-s3)$/.test(bucket) ||
      rawPrefix.startsWith('/') || prefix.includes('\\') || prefix.includes('://') || /[\x00-\x1f\x7f]/.test(prefix) ||
      prefix && prefix.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('error.s3Config');
  return { ...input, region, bucket, prefix };
}

export class S3Service {
  constructor(private readonly dependencies: Dependencies) {}
  get enabled(): boolean { return this.dependencies.getOptions().enabled === true; }

  async upload(result: CompressionResult): Promise<StoredObject> {
    const supplied = this.dependencies.getOptions();
    if (supplied.enabled !== true) throw new Error('error.s3Disabled');
    const config = options(supplied);
    const credentials = this.dependencies.getCredentials();
    if (!credentials || typeof credentials.accessKeyId !== 'string' || !credentials.accessKeyId.trim() ||
        typeof credentials.secretAccessKey !== 'string' || !credentials.secretAccessKey.trim() ||
        credentials.sessionToken !== undefined && typeof credentials.sessionToken !== 'string') throw new Error('error.s3Credentials');
    const contentType = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif' }[path.extname(result.outputPath).slice(1).toLowerCase()];
    const filename = path.basename(result.outputPath);
    if (!contentType || /[\x00-\x1f\x7f\\]/.test(filename)) throw new Error('error.s3File');
    const key = config.prefix ? `${config.prefix}/${filename}` : filename;
    if (Buffer.byteLength(key, 'utf8') > 1024) throw new Error('error.s3Config');
    let body: Buffer;
    try {
      const stat = await fs.lstat(result.outputPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size !== result.outputBytes) throw new Error('error.s3File');
      body = await fs.readFile(result.outputPath);
      if (createHash('sha256').update(body).digest('hex') !== result.outputFingerprint) throw new Error('error.s3File');
    } catch { throw new Error('error.s3File'); }
    const factory = this.dependencies.clientFactory ?? ((clientOptions: ClientOptions): S3Transport => new S3Client(clientOptions));
    let client: S3Transport | undefined;
    try {
      client = factory({ region: config.region, credentials, ignoreConfiguredEndpointUrls: true, maxAttempts: 3 });
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType, IfNoneMatch: '*' }));
    } catch (error) {
      const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      throw new Error(failure?.name === 'PreconditionFailed' || failure?.$metadata?.httpStatusCode === 412 ? 'error.s3ObjectExists' : 'error.s3Upload');
    } finally { client?.destroy(); }
    return { bucket: config.bucket, key, location: `s3://${config.bucket}/${key.split('/').map(encodeURIComponent).join('/')}` };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from './service.ts';
import { CredentialStore } from '../../platform/credential-store.ts';
import type { CredentialCipher } from '../../platform/credential-store.ts';
import type { CompressionResult, S3Credentials, S3Options } from '../../../shared/contracts.ts';

const credentials: S3Credentials = { accessKeyId: 'TEST_ACCESS_KEY_1234', secretAccessKey: 'fake-secret-for-local-tests-only', sessionToken: 'temporary-test-session' };
const configuration: S3Options = { enabled: true, region: 'ap-northeast-1', bucket: 'my-photo-bucket', prefix: 'images/exports/' };

async function fixture(extension = 'png') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tinypng-s3-test-'));
  const outputPath = path.join(directory, `photo tinified.${extension}`);
  const bytes = Buffer.from('local compressed image fixture');
  await fs.writeFile(outputPath, bytes);
  const result: CompressionResult = { source: outputPath, outputPath, originalBytes: 100, outputBytes: bytes.length,
    savedBytes: 100 - bytes.length, width: 10, height: 10, skipped: false, outputFingerprint: createHash('sha256').update(bytes).digest('hex') };
  return { directory, bytes, result };
}

test('S3 is opt-in and never resolves credentials or creates a client when disabled', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const service = new S3Service({ getOptions: () => ({ ...configuration, enabled: false }),
    getCredentials: () => { assert.fail('Credentials accessed while S3 disabled'); },
    clientFactory: () => { assert.fail('Client created while S3 disabled'); } });
  assert.equal(service.enabled, false);
  await assert.rejects(service.upload(sample.result), /error.s3Disabled/);
});

test('S3 uploads the exact output privately without remote overwrite and closes the client', async t => {
  const sample = await fixture('webp');
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const commands: PutObjectCommand[] = [];
  let destroyed = false;
  const service = new S3Service({ getOptions: () => configuration, getCredentials: () => credentials,
    clientFactory: options => {
      assert.equal(options.region, 'ap-northeast-1');
      assert.deepEqual(options.credentials, credentials);
      assert.equal(options.ignoreConfiguredEndpointUrls, true);
      return { send: async command => { commands.push(command); return {}; }, destroy: () => { destroyed = true; } };
    } });
  const stored = await service.upload(sample.result);
  assert.equal(commands.length, 1);
  const input = commands[0]!.input;
  assert.equal(input.Bucket, 'my-photo-bucket');
  assert.equal(input.Key, 'images/exports/photo tinified.webp');
  assert.equal(input.ContentType, 'image/webp');
  assert.equal(input.IfNoneMatch, '*');
  assert.equal(input.ACL, undefined);
  assert.deepEqual(input.Body, sample.bytes);
  assert.equal(stored.location, 's3://my-photo-bucket/images/exports/photo%20tinified.webp');
  assert.equal(destroyed, true);
  assert.deepEqual(await fs.readFile(sample.result.outputPath), sample.bytes);
});

test('S3 infers PNG, JPEG and AVIF output MIME types', async t => {
  for (const [extension, expected] of [['png', 'image/png'], ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['avif', 'image/avif']] as const) {
    const sample = await fixture(extension);
    t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
    const service = new S3Service({ getOptions: () => ({ ...configuration, prefix: '' }), getCredentials: () => credentials,
      clientFactory: () => ({ send: async command => { assert.equal(command.input.ContentType, expected); return {}; }, destroy() {} }) });
    await service.upload(sample.result);
  }
});

test('S3 rejects invalid destinations before creating any transport', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const invalid: Partial<S3Options>[] = [
    { bucket: 'https://my-bucket' }, { bucket: 'Bucket' }, { bucket: 'a..bucket' }, { bucket: '192.168.0.1' },
    { prefix: '../images' }, { prefix: '/images' }, { prefix: '/' }, { prefix: 'images/../secrets' }, { prefix: 'images//photos' },
    { prefix: 'images\\photos' }, { region: 'us-east-1.example.org' },
  ];
  for (const patch of invalid) {
    const service = new S3Service({ getOptions: () => ({ ...configuration, ...patch }), getCredentials: () => credentials,
      clientFactory: () => { assert.fail('Invalid destination created a transport'); } });
    await assert.rejects(service.upload(sample.result), /error.s3Config/);
  }
});

test('S3 requires explicit credentials and never uses the SDK default provider', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const service = new S3Service({ getOptions: () => configuration, getCredentials: () => null,
    clientFactory: () => { assert.fail('Missing credentials created a client'); } });
  await assert.rejects(service.upload(sample.result), /error.s3Credentials/);
});

test('S3 rejects a local output changed since compression before any network request', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const changed = Buffer.alloc(sample.bytes.length, 'x');
  await fs.writeFile(sample.result.outputPath, changed);
  const service = new S3Service({ getOptions: () => configuration, getCredentials: () => credentials,
    clientFactory: () => { assert.fail('Changed local image created a transport'); } });
  await assert.rejects(service.upload(sample.result), /error.s3File/);
  assert.deepEqual(await fs.readFile(sample.result.outputPath), changed);
});

test('S3 rejects an output whose size no longer matches the recorded result', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  await fs.truncate(sample.result.outputPath, sample.result.outputBytes + 1024);
  const service = new S3Service({ getOptions: () => configuration, getCredentials: () => credentials,
    clientFactory: () => { assert.fail('Resized output created a transport'); } });
  await assert.rejects(service.upload(sample.result), /error.s3File/);
});

test('S3 failure preserves the local file, closes transport, and hides remote error details', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  for (const collision of [false, true]) {
    let destroyed = false;
    const failure = Object.assign(new Error('private remote diagnostics'), { $metadata: { httpStatusCode: collision ? 412 : 403 } });
    const service = new S3Service({ getOptions: () => configuration, getCredentials: () => credentials,
      clientFactory: () => ({ send: async () => { throw failure; }, destroy: () => { destroyed = true; } }) });
    await assert.rejects(service.upload(sample.result), error => {
      assert.equal((error as Error).message, collision ? 'error.s3ObjectExists' : 'error.s3Upload');
      return true;
    });
    assert.equal(destroyed, true);
    assert.deepEqual(await fs.readFile(sample.result.outputPath), sample.bytes);
  }
});

class TestCipher implements CredentialCipher {
  available = true;
  private readonly key = randomBytes(32);
  isEncryptionAvailable(): boolean { return this.available; }
  encryptString(value: string): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce);
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), data]);
  }
  decryptString(value: Buffer): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key, value.subarray(0, 12), { authTagLength: 16 });
    decipher.setAuthTag(value.subarray(12, 28));
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8');
  }
}

test('credential store writes encrypted bytes with private permissions and round-trips without Electron', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const file = path.join(sample.directory, 's3-credentials.bin');
  const store = new CredentialStore(file, new TestCipher());
  assert.equal(store.hasCredentials(), false);
  assert.equal(store.read(), null);
  store.save(credentials);
  const encrypted = await fs.readFile(file);
  assert.equal(encrypted.includes(Buffer.from(credentials.secretAccessKey)), false);
  assert.equal(encrypted.includes(Buffer.from(credentials.accessKeyId)), false);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal(store.hasCredentials(), true);
  assert.deepEqual(store.read(), credentials);
});

test('credential store refuses plaintext fallback and retains previous encrypted value on failure', async t => {
  const sample = await fixture();
  t.after(() => fs.rm(sample.directory, { recursive: true, force: true }));
  const file = path.join(sample.directory, 's3-credentials.bin');
  const cipher = new TestCipher();
  const store = new CredentialStore(file, cipher);
  store.save(credentials);
  const previous = await fs.readFile(file);
  cipher.available = false;
  assert.throws(() => store.save(credentials), /error.s3Encryption/);
  assert.throws(() => store.read(), /error.s3Encryption/);
  assert.deepEqual(await fs.readFile(file), previous);
  cipher.available = true;
  assert.throws(() => store.save({ accessKeyId: '', secretAccessKey: credentials.secretAccessKey }), /error.s3Credentials/);
  assert.deepEqual(store.read(), credentials);
  await fs.writeFile(file, 'not encrypted credentials');
  assert.throws(() => store.read(), /error.s3Credentials/);
});

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { S3Credentials } from '../../shared/contracts';

export interface CredentialCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

function credentials(input: unknown): S3Credentials {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('error.s3Credentials');
  const value = input as Record<string, unknown>;
  const clean = (key: string, limit: number): string => {
    const field = value[key];
    if (typeof field !== 'string' || !field.trim() || field.length > limit || /[\x00-\x1f\x7f]/.test(field.trim())) throw new Error('error.s3Credentials');
    return field.trim();
  };
  const result: S3Credentials = { accessKeyId: clean('accessKeyId', 128), secretAccessKey: clean('secretAccessKey', 4096) };
  if (value.sessionToken !== undefined && value.sessionToken !== '') result.sessionToken = clean('sessionToken', 16384);
  return result;
}

export class CredentialStore {
  constructor(private readonly file: string, private readonly cipher: CredentialCipher) {}

  hasCredentials(): boolean {
    try {
      const stat = fs.lstatSync(this.file);
      return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 65_536;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Tiny PNG: could not inspect encrypted credential file');
      return false;
    }
  }

  read(): S3Credentials | null {
    let encrypted: Buffer;
    try {
      const stat = fs.lstatSync(this.file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > 65_536) throw new Error('error.s3Credentials');
      encrypted = fs.readFileSync(this.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new Error('error.s3Credentials');
    }
    if (!this.cipher.isEncryptionAvailable()) throw new Error('error.s3Encryption');
    try { return credentials(JSON.parse(this.cipher.decryptString(encrypted))); }
    catch { throw new Error('error.s3Credentials'); }
  }

  save(input: S3Credentials): void {
    const value = credentials(input);
    if (!this.cipher.isEncryptionAvailable()) throw new Error('error.s3Encryption');
    const temporary = path.join(path.dirname(this.file), `.s3-credentials-${randomUUID()}.tmp`);
    try {
      const encrypted = this.cipher.encryptString(JSON.stringify(value));
      if (!encrypted.length) throw new Error('error.s3Encryption');
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, this.file);
    } catch { throw new Error('error.s3Encryption'); }
    finally {
      try { fs.unlinkSync(temporary); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('Tiny PNG: could not remove encrypted credential temporary file'); }
    }
  }
}

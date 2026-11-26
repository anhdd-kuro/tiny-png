import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { compressFile } from './compressor';
import { collectFiles } from './files';
import type { SettingsStore } from '../settings/store';
import type { Job, BatchSummary } from '../../../shared/contracts';
import type { S3Service } from '../s3/service';

export class CompressionQueue extends EventEmitter {
  jobs: Job[] = [];
  isProcessing = false;
  paused = false;
  private ingestion: Promise<unknown> = Promise.resolve();
  private notificationJobs = new Map<string, Job>();
  constructor(readonly settings: SettingsStore, private readonly s3?: Pick<S3Service, 'enabled' | 'upload'>) { super(); }
  isBusy(file: string): boolean { return this.jobs.some(job => job.source === path.resolve(file) && ['queued', 'processing'].includes(job.state)); }
  snapshot(): { jobs: Job[]; isProcessing: boolean; paused: boolean } { return { jobs: this.jobs, isProcessing: this.isProcessing, paused: this.paused }; }
  enqueue(paths: string[], origin: 'manual' | 'watch' = 'manual'): Promise<void> {
    const operation = this.ingestion.then(async () => {
      const files = await collectFiles(paths);
      if (!files.length) throw new Error('error.noImages');
      for (const source of files) {
        if (this.isBusy(source)) continue;
        let stat;
        try { stat = await fs.stat(source); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
        this.jobs.push({ id: randomUUID(), source, name: path.basename(source), originalBytes: stat.size, state: 'queued', error: null, result: null });
        this.emit('accepted', source, origin);
      }
      this.emit('change');
      if (!this.paused) void this.run();
    });
    // Callers receive the rejection; a failed ingestion must not block the next one.
    this.ingestion = operation.catch(() => {});
    return operation;
  }
  async run(): Promise<void> {
    if (this.isProcessing || this.paused) return;
    this.isProcessing = true;
    this.emit('change');
    try {
      let job: Job | undefined;
      while (!this.paused && (job = this.jobs.find(item => item.state === 'queued'))) {
        job.state = 'processing'; job.error = null;
        job.phase = job.result ? 'uploading' : 'compressing';
        this.emit('change');
        try {
          if (!job.result) {
            job.result = await compressFile(job.source, { ...this.settings.value });
            this.emit('output', job.result);
          }
          if (this.s3?.enabled && !job.result.remoteLocation) {
            job.phase = 'uploading';
            this.emit('change');
            const remote = await this.s3.upload(job.result);
            job.result.remoteLocation = remote.location;
          }
          job.state = 'completed';
        } catch (error) {
          job.state = 'failed';
          job.error = (error as Error).message;
          console.warn('Tiny PNG: image processing failed:', job.phase, (error as Error).name);
        }
        this.emit('settled', job);
        this.notificationJobs.set(job.id, job);
        this.emit('change');
      }
    } finally { this.isProcessing = false; this.emit('change'); this.notifyIfIdle(); }
  }
  private notifyIfIdle(): void {
    if (this.isProcessing || this.jobs.some(job => job.state === 'queued') || !this.notificationJobs.size) return;
    const summary: BatchSummary = { completed: 0, failed: 0, savedBytes: 0 };
    for (const job of this.notificationJobs.values()) {
      if (job.state === 'completed') summary.completed++;
      else if (job.state === 'failed') summary.failed++;
      summary.savedBytes += Math.max(0, job.result?.savedBytes ?? 0);
    }
    this.notificationJobs.clear();
    this.emit('drained', summary);
  }
  pause(): void { this.paused = true; this.emit('change'); }
  resume(): void { this.paused = false; void this.run(); }
  retry(id: string): void {
    const job = this.jobs.find(item => item.id === id && item.state === 'failed');
    if (job) { job.state = 'queued'; job.error = null; this.emit('change'); if (!this.paused) void this.run(); }
  }
  remove(id: string): void { this.jobs = this.jobs.filter(job => job.id !== id || job.state === 'processing'); this.emit('change'); this.notifyIfIdle(); }
  clearFinished(): void { this.jobs = this.jobs.filter(job => ['queued', 'processing'].includes(job.state)); this.emit('change'); this.notifyIfIdle(); }
}

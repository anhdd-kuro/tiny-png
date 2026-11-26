export type Language = 'en' | 'vi' | 'ja';
export type DropCorner = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'topCenter';
export type ResizeMethod = 'fit' | 'cover' | 'scale' | 'thumb';
export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp' | 'avif';

export interface CompressionOptions {
  quality: number;
  overwrite: boolean;
  resizeEnabled: boolean;
  resizeMode: 'dimensions' | 'percent';
  resizePercent: number;
  resizeMethod: ResizeMethod;
  width: number;
  height: number;
  format: OutputFormat;
  outputDirectory: string | null;
}
export interface CompressionResult {
  source: string;
  outputPath: string;
  originalBytes: number;
  outputBytes: number;
  savedBytes: number;
  width: number;
  height: number;
  skipped: boolean;
  outputFingerprint: string;
  remoteLocation?: string;
}
export interface S3Credentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string }
export interface S3Options { enabled: boolean; region: string; bucket: string; prefix: string }
export interface Settings extends CompressionOptions {
  notificationsEnabled: boolean;
  glassEnabled: boolean;
  language: Language;
  cornerEnabled: boolean;
  dropCorner: DropCorner;
  cornerMode: 'always' | 'nearby';
  watchPath: string | null;
  watchEnabled: boolean;
  s3Enabled: boolean;
  s3Region: string;
  s3Bucket: string;
  s3Prefix: string;
}
export interface BatchSummary { completed: number; failed: number; savedBytes: number }
export interface Job {
  id: string;
  source: string;
  name: string;
  originalBytes: number;
  state: 'queued' | 'processing' | 'completed' | 'failed';
  result: CompressionResult | null;
  error: string | null;
  phase?: 'compressing' | 'uploading';
}
export interface AppState {
  jobs: Job[];
  settings: Settings;
  isProcessing: boolean;
  paused: boolean;
  watchRunning: boolean;
  notice: string | null;
  translations: Record<string, string>;
  hasS3Credentials: boolean;
}
export type SettingsPatch = Partial<Omit<Settings, 'watchPath' | 'watchEnabled' | 'outputDirectory'>> & { outputDirectory?: null };
export interface TinyPNG {
  getState(): Promise<AppState>;
  onState(callback: (state: AppState) => void): () => void;
  onOpenSettings(callback: () => void): () => void;
  chooseFiles(): Promise<void>;
  enqueueFiles(files: File[]): Promise<void>;
  chooseWatchFolder(): Promise<void>;
  startWatch(): Promise<void>;
  stopWatch(): Promise<void>;
  chooseOutputFolder(): Promise<void>;
  updateSettings(patch: SettingsPatch): Promise<AppState>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  retry(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  clearFinished(): Promise<void>;
  reveal(path: string): Promise<void>;
  openMain(): Promise<void>;
  dismissNotice(): Promise<void>;
  saveS3Credentials(credentials: S3Credentials): Promise<AppState>;
}
export const IPC = {
  getState: 'get-state', state: 'state', openSettings: 'open-settings', chooseFiles: 'choose-files', enqueue: 'enqueue',
  chooseWatch: 'choose-watch', startWatch: 'start-watch', stopWatch: 'stop-watch', chooseOutput: 'choose-output',
  updateSettings: 'update-settings', pause: 'pause', resume: 'resume', retry: 'retry', remove: 'remove', clear: 'clear',
  reveal: 'reveal', openMain: 'open-main', dismissNotice: 'dismiss-notice',
  saveS3Credentials: 'save-s3-credentials',
} as const;

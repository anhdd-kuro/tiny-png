import type { NotificationDiagnostics } from './notifications';
export type Language = 'en' | 'vi' | 'ja';
export type DropCorner = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'topCenter';
export type ResizeMethod = 'fit' | 'cover' | 'scale' | 'thumb';
export type OutputFormat = 'original' | 'png' | 'jpeg' | 'webp' | 'avif';
export type SettingsCategory = 'images' | 'automation' | 'general' | 'cloud' | 'history';
export interface CornerPresentationState { visible: boolean; animated: boolean }
export type HistoryAction = 'detected' | 'watchDetected' | 'compressed' | 'skipped' | 'failed' | 'uploaded' | 'uploadFailed' | 'watchStarted' | 'watchStopped' | 'watchFailed' | 'notificationRequested' | 'notificationSent' | 'notificationFailed' | 'notificationSuppressed' | 'notificationUnconfirmed';
export interface HistoryEntry {
  id: string;
  timestamp: string;
  file: string | null;
  action: HistoryAction;
  outputPath?: string;
  originalBytes?: number;
  outputBytes?: number;
  error?: string;
}

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
  backgroundStyle: 'gradient' | 'solid';
  glassOpacity: number;
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
  history: HistoryEntry[];
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
  onCornerPresentation(callback: (state: CornerPresentationState) => void): () => void;
  getState(): Promise<AppState>;
  onState(callback: (state: AppState) => void): () => void;
  onOpenSettings(callback: (category?: SettingsCategory) => void): () => void;
  openSettings(category?: SettingsCategory): Promise<void>;
  setSettingsCategory(category: SettingsCategory): Promise<void>;
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
  getNotificationDiagnostics(): Promise<NotificationDiagnostics>;
  onNotificationDiagnostics(callback: (diagnostics: NotificationDiagnostics) => void): () => void;
  refreshNotificationDiagnostics(): Promise<NotificationDiagnostics>;
  revealNotificationLogs(): Promise<void>;
  clearHistory(): Promise<void>;
  testNotification(): Promise<void>;
  openNotificationSettings(): Promise<void>;
}
export const IPC = {
  cornerReady: 'corner-ready', cornerPresentation: 'corner-presentation',
  getState: 'get-state', state: 'state', openSettings: 'open-settings', chooseFiles: 'choose-files', enqueue: 'enqueue',
  chooseWatch: 'choose-watch', startWatch: 'start-watch', stopWatch: 'stop-watch', chooseOutput: 'choose-output',
  updateSettings: 'update-settings', pause: 'pause', resume: 'resume', retry: 'retry', remove: 'remove', clear: 'clear',
  reveal: 'reveal', openMain: 'open-main', dismissNotice: 'dismiss-notice',
  saveS3Credentials: 'save-s3-credentials',
  settingsReady: 'settings-ready',
  settingsCategory: 'settings-category',
  getNotificationDiagnostics: 'get-notification-diagnostics',
  notificationDiagnostics: 'notification-diagnostics',
  refreshNotificationDiagnostics: 'refresh-notification-diagnostics',
  revealNotificationLogs: 'reveal-notification-logs',
  clearHistory: 'clear-history',
  testNotification: 'test-notification',
  openNotificationSettings: 'open-notification-settings',
} as const;

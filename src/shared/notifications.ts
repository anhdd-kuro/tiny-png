export type NotificationSetting = 'enabled' | 'disabled' | 'notSupported' | 'unknown';
export interface NotificationSystemSettings {
  authorization: 'notDetermined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral' | 'unknown';
  alert: NotificationSetting;
  alertStyle: 'none' | 'banner' | 'alert' | 'unknown';
  notificationCenter: NotificationSetting;
  sound: NotificationSetting;
  scheduledDelivery?: NotificationSetting;
  timeSensitive?: NotificationSetting;
}
export interface NotificationIdentity {
  appId: string;
  version: string;
  mode: 'adhoc' | 'certificate' | 'unknown';
  codeHash: string | null;
  requirement: string | null;
  changedSinceLastRun: boolean | null;
}
export type NotificationDiagnosticAction = 'startup' | 'settings' | 'settingsFailed' | 'request' | 'accepted' | 'failed' | 'unconfirmed' | 'inNotificationCenter' | 'notInNotificationCenter' | 'inspectionFailed' | 'clicked' | 'closed';
export interface NotificationDiagnosticEvent {
  id: string;
  timestamp: string;
  action: NotificationDiagnosticAction;
  notificationId?: string;
  detail?: string;
  settings?: NotificationSystemSettings;
}
export interface NotificationDiagnostics {
  identity: NotificationIdentity;
  settings: NotificationSystemSettings | null;
  checkedAt: string | null;
  events: NotificationDiagnosticEvent[];
}

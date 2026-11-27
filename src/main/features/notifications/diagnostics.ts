import type { NotificationDiagnostics, NotificationSystemSettings } from '../../../shared/notifications';
import type { NotificationJournal } from './journal';

export class NotificationDiagnosticsService {
  private pending: Promise<NotificationDiagnostics> | undefined;
  constructor(private readonly journal: NotificationJournal, private readonly readSettings: () => Promise<NotificationSystemSettings>) {}
  refresh(): Promise<NotificationDiagnostics> {
    this.pending ??= Promise.resolve().then(this.readSettings).then(settings => this.journal.setSettings(settings), error => this.journal.settingsFailed(error))
      .then(() => this.journal.snapshot()).finally(() => { this.pending = undefined; });
    return this.pending;
  }
}

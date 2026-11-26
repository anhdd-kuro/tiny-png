import { validatePatch, type SettingsStore } from './store';

export class SettingsUpdater {
  private confirmation: Promise<boolean> | null = null;
  private overwriteRequest = 0;

  constructor(private readonly store: SettingsStore, private readonly confirmOverwrite: () => Promise<boolean>) {}

  async update(input: unknown): Promise<boolean> {
    const patch = validatePatch(input);
    const request = patch.overwrite === undefined ? this.overwriteRequest : ++this.overwriteRequest;
    if (patch.overwrite === true && !this.store.value.overwrite) {
      this.confirmation ??= this.confirmOverwrite().finally(() => { this.confirmation = null; });
      const approved = await this.confirmation;
      if (!approved || request !== this.overwriteRequest) return false;
    }
    this.store.update(patch);
    return true;
  }
}

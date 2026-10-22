import { Inject, Injectable, InjectionToken, OnDestroy, signal } from '@angular/core';
import {
  normalizeSavedPointRecord,
  normalizeSavedPointSnapshot,
  SAVED_POINT_SCHEMA_VERSION,
  SavedPointRecordV1,
  SavedPointSnapshot
} from './saved-points.models';

export const SAVED_POINTS_STORAGE_KEY = 'sivoy.saved-points.v1';
export const SAVED_POINTS_LIMIT = 50;

export type SavePointOutcome =
  | 'saved'
  | 'already-saved'
  | 'limit-reached'
  | 'invalid-point'
  | 'storage-unavailable';

export interface SavedPointsStorageEvent {
  key: string | null;
  newValue: string | null;
}

export interface SavedPointsBrowser {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  addStorageListener(listener: (event: SavedPointsStorageEvent) => void): () => void;
  nowIso(): string;
}

class DefaultSavedPointsBrowser implements SavedPointsBrowser {
  getItem(key: string): string | null {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined') throw new Error('Browser storage is unavailable');
    window.localStorage.setItem(key, value);
  }

  addStorageListener(listener: (event: SavedPointsStorageEvent) => void): () => void {
    if (typeof window === 'undefined') return () => undefined;
    const handler = (event: StorageEvent): void => listener({ key: event.key, newValue: event.newValue });
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  nowIso(): string {
    return new Date().toISOString();
  }
}

export const SAVED_POINTS_BROWSER = new InjectionToken<SavedPointsBrowser>('SavedPointsBrowser', {
  providedIn: 'root',
  factory: () => new DefaultSavedPointsBrowser()
});

@Injectable({ providedIn: 'root' })
export class SavedPointsService implements OnDestroy {
  private readonly records = signal<SavedPointRecordV1[]>([]);
  private readonly removeStorageListener: () => void;
  readonly savedPoints = this.records.asReadonly();

  constructor(@Inject(SAVED_POINTS_BROWSER) private readonly browser: SavedPointsBrowser) {
    this.records.set(this.readPersisted());
    this.removeStorageListener = this.browser.addStorageListener(event => {
      if (event.key !== SAVED_POINTS_STORAGE_KEY && event.key !== null) return;
      this.records.set(this.parseRecords(event.newValue));
    });
  }

  ngOnDestroy(): void {
    this.removeStorageListener();
  }

  isSaved(pointId: string): boolean {
    return this.records().some(record => record.pointId === pointId);
  }

  save(candidate: SavedPointSnapshot): SavePointOutcome {
    const snapshot = normalizeSavedPointSnapshot(candidate);
    if (!snapshot) return 'invalid-point';
    if (this.isSaved(snapshot.pointId)) return 'already-saved';
    if (this.records().length >= SAVED_POINTS_LIMIT) return 'limit-reached';

    const savedAtTime = Date.parse(this.browser.nowIso());
    if (!Number.isFinite(savedAtTime)) return 'storage-unavailable';
    const record: SavedPointRecordV1 = {
      version: SAVED_POINT_SCHEMA_VERSION,
      pointId: snapshot.pointId,
      savedAt: new Date(savedAtTime).toISOString(),
      snapshot
    };
    const nextRecords = [record, ...this.records()];
    return this.persist(nextRecords) ? 'saved' : 'storage-unavailable';
  }

  remove(pointId: string): boolean {
    const nextRecords = this.records().filter(record => record.pointId !== pointId);
    if (nextRecords.length === this.records().length) return false;
    return this.persist(nextRecords);
  }

  private readPersisted(): SavedPointRecordV1[] {
    try {
      return this.parseRecords(this.browser.getItem(SAVED_POINTS_STORAGE_KEY));
    } catch {
      return [];
    }
  }

  private parseRecords(raw: string | null): SavedPointRecordV1[] {
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const unique = new Map<string, SavedPointRecordV1>();
      parsed
        .map(normalizeSavedPointRecord)
        .filter((record): record is SavedPointRecordV1 => record !== null)
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
        .forEach(record => {
          if (!unique.has(record.pointId)) unique.set(record.pointId, record);
        });
      return Array.from(unique.values()).slice(0, SAVED_POINTS_LIMIT);
    } catch {
      return [];
    }
  }

  private persist(records: SavedPointRecordV1[]): boolean {
    try {
      this.browser.setItem(SAVED_POINTS_STORAGE_KEY, JSON.stringify(records));
      this.records.set(records);
      return true;
    } catch {
      return false;
    }
  }
}

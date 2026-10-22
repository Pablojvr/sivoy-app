import { TestBed } from '@angular/core/testing';
import {
  SAVED_POINTS_BROWSER,
  SAVED_POINTS_STORAGE_KEY,
  SavedPointsBrowser,
  SavedPointsService
} from './saved-points.service';
import { SavedPointSnapshot } from './saved-points.models';

class FakeSavedPointsBrowser implements SavedPointsBrowser {
  private readonly values = new Map<string, string>();
  private storageListener?: (event: { key: string | null; newValue: string | null }) => void;
  now = '2026-10-18T12:00:00.000Z';
  writeError: unknown = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.writeError) throw this.writeError;
    this.values.set(key, value);
  }

  addStorageListener(listener: (event: { key: string | null; newValue: string | null }) => void): () => void {
    this.storageListener = listener;
    return () => {
      this.storageListener = undefined;
    };
  }

  nowIso(): string {
    return this.now;
  }

  seed(raw: string): void {
    this.values.set(SAVED_POINTS_STORAGE_KEY, raw);
  }

  emitStorage(raw: string | null, key: string | null = SAVED_POINTS_STORAGE_KEY): void {
    if (key === null) this.values.clear();
    else if (raw === null) this.values.delete(key);
    else this.values.set(key, raw);
    this.storageListener?.({ key, newValue: raw });
  }
}

function snapshot(pointId: string, name = `Punto ${pointId}`): SavedPointSnapshot {
  return {
    pointId,
    name,
    company: { companyId: 'company-1', name: 'Pedidos Express', logoUrl: null },
    pointType: 'AGENCY',
    location: {
      department: 'San Salvador',
      municipality: 'San Salvador',
      address: 'Centro Histórico',
      coordinates: { lat: 13.6929, lng: -89.2182 }
    },
    media: { imageUrl: 'https://example.com/point.webp', mapsUrl: null }
  };
}

describe('SavedPointsService', () => {
  let browser: FakeSavedPointsBrowser;

  function createService(): SavedPointsService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        SavedPointsService,
        { provide: SAVED_POINTS_BROWSER, useValue: browser }
      ]
    });
    return TestBed.inject(SavedPointsService);
  }

  beforeEach(() => {
    browser = new FakeSavedPointsBrowser();
  });

  it('loads valid records newest first and discards invalid records', () => {
    browser.seed(JSON.stringify([
      { version: 1, pointId: 'old', savedAt: '2026-10-16T10:00:00.000Z', snapshot: snapshot('old') },
      { version: 99, pointId: 'future', savedAt: '2026-10-19T10:00:00.000Z', snapshot: snapshot('future') },
      { version: 1, pointId: 'new', savedAt: '2026-10-17T10:00:00.000Z', snapshot: snapshot('new') },
      { version: 1, pointId: '', savedAt: 'not-a-date', snapshot: {} }
    ]));

    const service = createService();

    expect(service.savedPoints().map(item => item.pointId)).toEqual(['new', 'old']);
  });

  it('recovers with an empty list when persisted JSON is corrupt', () => {
    browser.seed('{invalid-json');

    const service = createService();

    expect(service.savedPoints()).toEqual([]);
  });

  it('saves a point once and persists the versioned public snapshot', () => {
    const service = createService();

    expect(service.save(snapshot('point-1'))).toBe('saved');
    expect(service.save(snapshot('point-1', 'Renamed'))).toBe('already-saved');
    expect(service.isSaved('point-1')).toBe(true);
    expect(service.savedPoints()).toHaveLength(1);

    const stored = JSON.parse(browser.getItem(SAVED_POINTS_STORAGE_KEY) ?? '[]');
    expect(stored[0]).toEqual(expect.objectContaining({
      version: 1,
      pointId: 'point-1',
      savedAt: browser.now
    }));
    expect(stored[0].snapshot).toEqual(snapshot('point-1'));
  });

  it('enforces a maximum of 50 saved points without replacing existing data', () => {
    const service = createService();
    for (let index = 0; index < 50; index += 1) {
      browser.now = new Date(Date.UTC(2026, 9, 18, 12, index)).toISOString();
      expect(service.save(snapshot(`point-${index}`))).toBe('saved');
    }

    expect(service.save(snapshot('point-51'))).toBe('limit-reached');
    expect(service.savedPoints()).toHaveLength(50);
    expect(service.isSaved('point-51')).toBe(false);
  });

  it('removes a saved point and persists the remaining list', () => {
    const service = createService();
    service.save(snapshot('point-1'));
    browser.now = '2026-10-18T13:00:00.000Z';
    service.save(snapshot('point-2'));

    expect(service.remove('point-1')).toBe(true);
    expect(service.remove('missing')).toBe(false);
    expect(service.savedPoints().map(item => item.pointId)).toEqual(['point-2']);
  });

  it('updates reactively when another browser tab changes the storage key', () => {
    const service = createService();

    browser.emitStorage(JSON.stringify([
      { version: 1, pointId: 'remote', savedAt: '2026-10-18T14:00:00.000Z', snapshot: snapshot('remote') }
    ]));

    expect(service.isSaved('remote')).toBe(true);
    expect(service.savedPoints()[0]?.snapshot.name).toBe('Punto remote');
  });

  it('ignores storage events for other keys and clears when the saved key is removed', () => {
    const service = createService();
    service.save(snapshot('point-1'));

    browser.emitStorage('[]', 'unrelated');
    expect(service.isSaved('point-1')).toBe(true);

    browser.emitStorage(null);
    expect(service.savedPoints()).toEqual([]);
  });

  it('clears reactively when another tab clears all browser storage', () => {
    const service = createService();
    service.save(snapshot('point-1'));

    browser.emitStorage(null, null);

    expect(service.savedPoints()).toEqual([]);
  });

  it('keeps the current state when localStorage rejects a write', () => {
    const service = createService();
    browser.writeError = new Error('quota');

    expect(service.save(snapshot('point-1'))).toBe('storage-unavailable');
    expect(service.savedPoints()).toEqual([]);
  });

  it('rejects protocol-relative media URLs from persisted snapshots', () => {
    const service = createService();
    const unsafeSnapshot = snapshot('point-1');
    unsafeSnapshot.media.imageUrl = '//attacker.example/point.webp';

    expect(service.save(unsafeSnapshot)).toBe('saved');
    expect(service.savedPoints()[0]?.snapshot.media.imageUrl).toBeNull();
  });
});

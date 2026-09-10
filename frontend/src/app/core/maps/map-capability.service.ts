import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class MapCapabilityService {
  private _cachedResult: boolean | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    @Inject(DOCUMENT) private document: Document
  ) {}

  supportsInteractiveMap(): boolean {
    if (this._cachedResult !== null) {
      return this._cachedResult;
    }

    if (!isPlatformBrowser(this.platformId)) {
      this._cachedResult = false;
      return false;
    }

    try {
      const canvas = this.document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      this._cachedResult = gl !== null;
    } catch {
      this._cachedResult = false;
    }

    return this._cachedResult;
  }
}

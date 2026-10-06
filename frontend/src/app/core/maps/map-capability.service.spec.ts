import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { vi, Mock } from 'vitest';
import { MapCapabilityService } from './map-capability.service';

describe('MapCapabilityService', () => {
  let service: MapCapabilityService;

  let mockGetContext: Mock;
  let mockCreateElement: Mock;

  beforeEach(() => {
    mockGetContext = vi.fn();
    mockCreateElement = vi.fn().mockReturnValue({
      getContext: mockGetContext
    });

    TestBed.configureTestingModule({
      providers: [
        MapCapabilityService,
        {
          provide: DOCUMENT,
          useValue: { createElement: mockCreateElement }
        },
        { provide: PLATFORM_ID, useValue: 'browser' }
      ]
    });
  });

  it('returns true if webgl2 context exists', () => {
    mockGetContext.mockReturnValue({});

    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(true);
    expect(mockGetContext).toHaveBeenCalledWith('webgl2');
  });

  it('returns false if webgl2 context is null', () => {
    mockGetContext.mockReturnValue(null);

    service = TestBed.inject(MapCapabilityService);
    expect(service.supportsInteractiveMap()).toBe(false);
  });

  it('returns false and caches result if createElement throws an exception', () => {
    mockCreateElement.mockImplementation(() => {
      throw new Error('Canvas not supported');
    });

    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(false);
    expect(service.supportsInteractiveMap()).toBe(false); // Second call, relies on cache

    // Assert createElement was only called once due to caching
    expect(mockCreateElement).toHaveBeenCalledTimes(1);
  });

  it('returns false and caches result if getContext throws an exception', () => {
    mockGetContext.mockImplementation(() => {
      throw new Error('WebGL creation failed');
    });

    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(false);
    expect(service.supportsInteractiveMap()).toBe(false); // Second call, relies on cache

    // Assert getContext was only called once due to caching
    expect(mockGetContext).toHaveBeenCalledTimes(1);
  });

  it('returns false if not in browser (SSR)', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(false);
    expect(mockCreateElement).not.toHaveBeenCalled();
  });

  it('caches a true result (single detection)', () => {
    mockGetContext.mockReturnValue({});

    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(true);
    expect(service.supportsInteractiveMap()).toBe(true);

    expect(mockCreateElement).toHaveBeenCalledTimes(1);
    expect(mockGetContext).toHaveBeenCalledTimes(1);
  });

  it('caches a false result (single detection)', () => {
    mockGetContext.mockReturnValue(null);

    service = TestBed.inject(MapCapabilityService);

    expect(service.supportsInteractiveMap()).toBe(false);
    expect(service.supportsInteractiveMap()).toBe(false);

    expect(mockCreateElement).toHaveBeenCalledTimes(1);
    expect(mockGetContext).toHaveBeenCalledTimes(1);
  });
});

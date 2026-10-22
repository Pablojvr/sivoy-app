import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
class DummyService {
  getValue() {
    return 'Vitest works!';
  }
}

describe('Test Harness', () => {
  it('should pass a basic Vitest assertion', () => {
    expect(true).toBe(true);
  });

  it('should resolve a dependency via Angular TestBed', () => {
    TestBed.configureTestingModule({
      providers: [DummyService]
    });
    const service = TestBed.inject(DummyService);
    expect(service.getValue()).toBe('Vitest works!');
  });
});

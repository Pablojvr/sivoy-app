import { Injectable, Inject, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Observer } from 'rxjs';

export const WINDOW = new InjectionToken<Window>('Global window object', {
  factory: () => window
});

export interface NominatimAddress {
  suburb?: string;
  town?: string;
  village?: string;
  city_district?: string;
  municipality?: string;
  city?: string;
  county?: string;
  state_district?: string;
  state?: string;
}

export interface NominatimResponse {
  address?: NominatimAddress;
}

export interface GeoLocationCoords {
  lat: number;
  lng: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserGeolocationService {
  constructor(
    private http: HttpClient,
    @Inject(WINDOW) private window: Window
  ) {}

  getCurrentPosition(options?: PositionOptions): Observable<GeoLocationCoords> {
    return new Observable((observer: Observer<GeoLocationCoords>) => {
      if (!this.window.navigator || !this.window.navigator.geolocation) {
        observer.error(new Error('Geolocation is not supported by this browser.'));
        return;
      }

      let isUnsubscribed = false;
      const finalOptions: PositionOptions = {
        timeout: 15000,
        maximumAge: 60000,
        enableHighAccuracy: false,
        ...options
      };

      this.window.navigator.geolocation.getCurrentPosition(
        (position: GeolocationPosition) => {
          if (!isUnsubscribed) {
            observer.next({
              lat: position.coords.latitude,
              lng: position.coords.longitude
            });
            observer.complete();
          }
        },
        (error: GeolocationPositionError) => {
          if (!isUnsubscribed) {
            observer.error(error);
          }
        },
        finalOptions
      );

      return () => {
        isUnsubscribed = true;
      };
    });
  }

  reverseGeocode(lat: number, lng: number): Observable<NominatimResponse> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    return this.http.get<NominatimResponse>(url);
  }
}

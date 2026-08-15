import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `<div id="map" class="map-container" style="height: 100vh; width: 100%; position: absolute; top: 0; left: 0; z-index: 0;"></div>`,
  styles: []
})
export class MapComponent implements OnInit, OnDestroy {
  @Input() locations: any[] = [];
  @Input() highlightedRoute: any = null;
  @Output() locationPicked = new EventEmitter<{lat: string, lng: string}>();
  @Output() markerClicked = new EventEmitter<any>();

  map: any;
  markers: any[] = [];
  mapMoveListener: any;

  ngOnInit() {
    this.initMap();
  }

  ngOnDestroy() {
    if (this.map) {
      this.map.remove();
    }
  }

  initMap() {
    this.map = L.map('map', {
      zoomControl: false,
      attributionControl: false
    }).setView([13.794185, -88.89653], 8);

    L.tileLayer('http://mt0.google.com/vt/lyrs=m&hl=es&x={x}&y={y}&z={z}', {
      maxZoom: 19
    }).addTo(this.map);
  }

  // TODO: Implement updateMapMarkers, picking logic, etc.
}

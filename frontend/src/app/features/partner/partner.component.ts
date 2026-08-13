import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

@Component({
  selector: 'app-partner-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './partner.component.html',
  styleUrls: ['./partner.component.css']
})
export class PartnerComponent implements OnInit {
  activeTab: 'puntos' | 'reglas' | 'dashboard' | 'conexiones' = 'puntos';
  activeEmpresa: string = '';
  
  empresasList: string[] = [];
  allLocations: any[] = [];
  companyLocations: any[] = [];
  loading: boolean = true;
  
  partnerMap: any;
  mapMarkers: any[] = [];
  
  selectedLocationToEdit: any = null;
  excepcionesTemporales: any[] = [];
  searchText: string = '';
  
  currentPage: number = 1;
  itemsPerPage: number = 12;
  
  constructor(private http: HttpClient) { }

  ngOnInit(): void {
    this.fetchLocations();
  }
  
  fetchLocations() {
    this.loading = true;
    this.http.get('http://localhost:3000/api/locations').subscribe({
      next: (data: any) => {
        this.allLocations = data || [];
        // Extraer lista de empresas únicas
        this.empresasList = Array.from(new Set(this.allLocations.map(l => l.empresa))).filter(e => e) as string[];
        
        if (this.empresasList.length > 0 && !this.activeEmpresa) {
          this.activeEmpresa = this.empresasList[0];
        }
        
        this.filterByCompany();
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading locations', err);
        this.loading = false;
      }
    });
  }
  
  onCompanyChange() {
    this.filterByCompany();
  }
  
  filterByCompany() {
    if (!this.activeEmpresa) {
      this.companyLocations = [];
      return;
    }
    this.companyLocations = this.allLocations.filter(loc => loc.empresa === this.activeEmpresa);
  }
  
  get stats() {
    const soloEnvios = this.companyLocations.filter(l => {
      // Check if ALL schedules are 'Solo Enviar'
      if (!l.horarios_operativos || l.horarios_operativos.length === 0) return false;
      return l.horarios_operativos.every((h: any) => h.tipo_accion === 'Solo Enviar');
    }).length;
    
    return {
      total: this.companyLocations.length,
      soloEnvios: soloEnvios
    };
  }
  
  get allFilteredCompanyLocations() {
    if (!this.searchText) return this.companyLocations;
    const s = this.searchText.toLowerCase();
    return this.companyLocations.filter(loc => 
      (loc.nombre_destino && loc.nombre_destino.toLowerCase().includes(s)) ||
      (loc.municipio && loc.municipio.toLowerCase().includes(s))
    );
  }
  
  get paginatedLocations() {
    const filtered = this.allFilteredCompanyLocations;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return filtered.slice(startIndex, startIndex + this.itemsPerPage);
  }
  
  get totalPages() {
    return Math.ceil(this.allFilteredCompanyLocations.length / this.itemsPerPage);
  }
  
  get pagesArray() {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }
  
  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
  
  onFilterChange() {
    this.currentPage = 1;
  }
  
  administrarReglas(loc: any) {
    this.selectedLocationToEdit = loc;
    this.excepcionesTemporales = []; // Reset form
  }
  
  closePanel() {
    this.selectedLocationToEdit = null;
    this.excepcionesTemporales = [];
  }
  
  addExcepcion() {
    this.excepcionesTemporales.push({
      destino_id: '',
      tipo_regla: 'corte',
      valor: ''
    });
  }
  
  removeExcepcion(index: number) {
    this.excepcionesTemporales.splice(index, 1);
  }
  
  getOtherLocations() {
    if (!this.selectedLocationToEdit) return [];
    return this.companyLocations.filter(l => l.id !== this.selectedLocationToEdit.id);
  }
  
  descargarPlantilla() {
    window.open('http://localhost:3000/api/empresas/excel-template', '_blank');
  }
  
  initConnectionsMap(focusLoc?: any) {
    setTimeout(() => {
      if (this.partnerMap) {
        this.partnerMap.remove();
      }
      
      this.partnerMap = L.map('partnerMap', {
        zoomControl: false,
        attributionControl: false
      }).setView(focusLoc ? [focusLoc.ubicacion.lat, focusLoc.ubicacion.lng] : [13.69, -88.87], focusLoc ? 11 : 9);
      
      // Clean, light basemap for B2B style
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        maxZoom: 19
      }).addTo(this.partnerMap);
      
      this.drawConnections();
    }, 100);
  }
  
  drawConnections() {
    // 1. Draw all points as Hub nodes
    const validLocations = this.companyLocations.filter(l => l.ubicacion?.lat && l.ubicacion?.lng);
    
    validLocations.forEach(loc => {
      const circle = L.circleMarker([loc.ubicacion.lat, loc.ubicacion.lng], {
        radius: 6,
        fillColor: 'var(--primary)',
        color: '#fff',
        weight: 2,
        fillOpacity: 1
      }).addTo(this.partnerMap);
      
      circle.bindTooltip(`<b>${loc.nombre_destino}</b><br>${loc.municipio}`, { direction: 'top', className: 'b2b-tooltip' });
    });
    
    // 2. Simulate drawing curved flight paths between the first location and a few others
    if (validLocations.length >= 2) {
      const origin = validLocations[0];
      
      for (let i = 1; i < Math.min(validLocations.length, 5); i++) {
        const dest = validLocations[i];
        this.drawBezierCurve([origin.ubicacion.lat, origin.ubicacion.lng], [dest.ubicacion.lat, dest.ubicacion.lng]);
      }
      
      // Fit bounds
      const group = new L.FeatureGroup(validLocations.map(l => L.marker([l.ubicacion.lat, l.ubicacion.lng])));
      this.partnerMap.fitBounds(group.getBounds(), { padding: [50, 50] });
    }
  }
  
  drawBezierCurve(latlng1: [number, number], latlng2: [number, number]) {
    // Simple Quadratic Bezier Curve logic
    const lat1 = latlng1[0], lng1 = latlng1[1];
    const lat2 = latlng2[0], lng2 = latlng2[1];
    
    // Calculate midpoint
    const midLat = (lat1 + lat2) / 2;
    const midLng = (lng1 + lng2) / 2;
    
    // Offset the midpoint perpendicularly to create a curve
    // The offset magnitude depends on distance
    const dist = Math.sqrt(Math.pow(lat2 - lat1, 2) + Math.pow(lng2 - lng1, 2));
    const offset = dist * 0.2; // Adjust curvature here
    
    // Perpendicular vector
    const dx = lat2 - lat1;
    const dy = lng2 - lng1;
    // rotate 90 degrees
    const pLat = -dy;
    const pLng = dx;
    
    // Normalize
    const length = Math.sqrt(pLat * pLat + pLng * pLng);
    const cLat = midLat + (pLat / length) * offset;
    const cLng = midLng + (pLng / length) * offset;
    
    // Generate points along the curve (t from 0 to 1)
    const points: [number, number][] = [];
    const segments = 50;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const u = 1 - t;
      
      const qLat = u * u * lat1 + 2 * u * t * cLat + t * t * lat2;
      const qLng = u * u * lng1 + 2 * u * t * cLng + t * t * lng2;
      
      points.push([qLat, qLng]);
    }
    
    // Draw the curved line
    L.polyline(points, {
      color: 'var(--primary)',
      weight: 3,
      opacity: 0.6,
      dashArray: '5, 5' // Dashed line for effect
    }).addTo(this.partnerMap);
  }
}

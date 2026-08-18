import { environment } from '../../../environments/environment';
import { Component, Input, Output, EventEmitter, OnInit, ChangeDetectorRef, HostListener, ViewEncapsulation, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EmpresasService } from '../../core/services/empresas.service';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { EL_SALVADOR_LOCATIONS, DEPARTAMENTOS_EL_SALVADOR } from '../../core/constants/elsalvador-locations';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  encapsulation: ViewEncapsulation.None
})
export class AdminComponent implements OnInit {
  apiUrl = environment.apiUrl;
  @Input() locations: any[] = [];
  @Output() navigateToRegistro = new EventEmitter<{id: number | null, nombre: string}>();
  @Output() viewOnMapEvent = new EventEmitter<any>();
  @Output() minimizeModalEvent = new EventEmitter<boolean>();
  @Output() requestMapPick = new EventEmitter<any>();
  @Output() previewMapEvent = new EventEmitter<{lat: number, lng: number}>();
  @Output() previewImageEvent = new EventEmitter<string>();
  @Output() locationUpdated = new EventEmitter<any>();

  adminSubTab: 'empresas' | 'puntos' = 'puntos';
  adminEmpresasList: any[] = [];
  adminFilteredLocations: any[] = [];
  adminCompanies: string[] = [];
  adminCompanyFilter: string = '';
  adminSearchTerm: string = '';
  
  // Pagination & Scroll State
  first: number = 0;
  rows: number = 10;
  isScrolled: boolean = false;
  
  activeEmpresaMenuId: number | null = null;
  isEditingEmpresa: boolean = false;
  isSavingEmpresa: boolean = false;
  editingEmpresaData: any = { id: null, nombre: '', logoUrl: '', logoFile: null };

  viewingLocation: any = null;
  editingLocation: any = null;
  editFormData: any = {};
  editLocationTab: 'datos' | 'horarios' = 'datos';
  editImageFile: File | null = null;
  editImageUrl: string | null = null;
  editHorarios: any[] = [];
  isPickingLocation: boolean = false;
  isMinimized: boolean = false;

  departamentos = DEPARTAMENTOS_EL_SALVADOR;
  municipiosDisponibles: string[] = [];
  locationCatalog = EL_SALVADOR_LOCATIONS;

  checkB2BPassword() {
    const pwd = window.prompt('Introduce la contraseña para acceso B2B:');
    if (pwd === 'admin123') {
      window.location.hash = '/partner';
    } else if (pwd !== null) {
      this.toastService.showError('Contraseña incorrecta');
    }
  }

  async shareLocation(loc: any) {
    const textToShare = `📍 ${loc.nombre_destino}\n🏢 Empresa: ${loc.empresa || 'Agencia'}\n🗺️ Ubicación: ${loc.ubicacion?.municipio || 'N/A'}, ${loc.ubicacion?.departamento || 'N/A'}${loc.ubicacion?.direccion_referencia ? '\n📝 Referencia: ' + loc.ubicacion.direccion_referencia : ''}${loc.maps_url ? '\n🌍 Google Maps: ' + loc.maps_url : ''}`;
    
    const shareData: any = {
      title: `Punto: ${loc.nombre_destino}`,
      text: textToShare,
    };

    try {
      let fileToShare: File | null = null;
      if (loc.imagen_referencia && typeof navigator.canShare === 'function') {
        try {
          const imageUrl = `${environment.apiUrl}${loc.imagen_referencia}`;
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const ext = loc.imagen_referencia.split('.').pop() || 'png';
          fileToShare = new File([blob], `punto-${loc.id || 'info'}.${ext}`, { type: blob.type });
        } catch (e) {
          console.warn('No se pudo cargar la imagen para compartir', e);
        }
      }

      if (fileToShare) {
        shareData.files = [fileToShare];
      }

      if (navigator.share && typeof navigator.canShare === 'function' && navigator.canShare(shareData)) {
        await navigator.share(shareData);
        this.toastService.showSuccess('¡Información compartida con éxito!', 'Compartido');
      } else if (navigator.share) {
        await navigator.share({ title: shareData.title, text: shareData.text });
        this.toastService.showSuccess('¡Información compartida con éxito!', 'Compartido');
      } else {
        await navigator.clipboard.writeText(textToShare);
        this.toastService.showSuccess('Información copiada al portapapeles', 'Copiado');
      }
    } catch (err) {
      console.error('Error al compartir', err);
      if ((err as Error).name !== 'AbortError') {
         navigator.clipboard.writeText(textToShare).then(() => {
           this.toastService.showSuccess('Información copiada al portapapeles', 'Copiado');
         });
      }
    }
  }

  googleLinkLoading = false;
  googleLinkError = '';
  isSavingLocation = false;
  isSavedSuccess = false;
  isProcessingImage = false;

  constructor(
    private empresasService: EmpresasService,
    private ubicacionesService: UbicacionesService,
    private mapasService: MapasService,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.extractCompanies();
  }

  ngAfterViewInit() {
    // Escuchar scroll del contenedor padre para el sticky header
    setTimeout(() => {
      const scrollContainer = document.querySelector('.admin-tab-content');
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', () => {
          this.isScrolled = scrollContainer.scrollTop > 20;
        });
      }
    }, 100);
  }

  extractCompanies() {
    this.adminCompanies = Array.from(new Set(this.locations.map(l => l.empresa))).filter(e => e) as string[];
    this.adminSearchTerm = '';
    this.loadAdminEmpresas();
    this.applyAdminFilter();
  }

  loadAdminEmpresas() {
    this.empresasService.getEmpresas().subscribe({
      next: (res: any) => {
        if (res.success) {
          this.adminEmpresasList = res.empresas;
          this.adminCompanies = res.empresas.map((e: any) => e.nombre);
          this.cdr.detectChanges();
        }
      },
      error: (err: any) => console.error('Error loading empresas', err)
    });
  }

  toggleEmpresaMenu(empId: number, event: Event) {
    event.stopPropagation();
    this.activeEmpresaMenuId = this.activeEmpresaMenuId === empId ? null : empId;
  }

  @HostListener('document:click')
  closeMenus() {
    this.activeEmpresaMenuId = null;
  }

  openNewEmpresaModal() {
    this.isEditingEmpresa = true;
    this.activeEmpresaMenuId = null;
    this.editingEmpresaData = { id: null, nombre: '', logoUrl: '', logoFile: null };
  }

  openEditEmpresaModal(empresa: any) {
    this.isEditingEmpresa = true;
    this.activeEmpresaMenuId = null;
    this.editingEmpresaData = { id: empresa.id, nombre: empresa.nombre, logoUrl: empresa.logo_url, logoFile: null };
  }

  viewEmpresaPuntos(empresa: any) {
    this.adminSubTab = 'puntos';
    this.adminCompanyFilter = empresa.nombre;
    this.applyAdminFilter();
    this.activeEmpresaMenuId = null;
  }

  addPuntoToEmpresa(empresa: any) {
    this.activeEmpresaMenuId = null;
    this.navigateToRegistro.emit({ id: empresa.id, nombre: empresa.nombre });
  }

  openRegistroLibre() {
    this.navigateToRegistro.emit({ id: null, nombre: '' });
  }

  onEmpresaLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editingEmpresaData.logoFile = file;
    }
  }

  validateEmpresaForm(): boolean {
    if (!this.editingEmpresaData.nombre || this.editingEmpresaData.nombre.trim() === '') {
      this.toastService.showError("El nombre de la empresa es requerido.", "Validación");
      return false;
    }
    return true;
  }

  saveEmpresa() {
    if (!this.validateEmpresaForm()) return;
    if (this.isSavingEmpresa) return;
    
    this.isSavingEmpresa = true;
    
    const formData = new FormData();
    formData.append('nombre', this.editingEmpresaData.nombre);
    if (this.editingEmpresaData.logoFile) {
      formData.append('logo', this.editingEmpresaData.logoFile);
    }
    
    const obs = this.editingEmpresaData.id 
      ? this.empresasService.updateEmpresa(this.editingEmpresaData.id, formData)
      : this.empresasService.createEmpresa(formData);

    obs.subscribe({
      next: (res: any) => {
        this.isSavingEmpresa = false;
        if (res.success) {
          this.isEditingEmpresa = false;
          this.loadAdminEmpresas();
          this.toastService.showSuccess("Empresa guardada exitosamente.", "Éxito");
        }
      },
      error: (e: any) => {
        this.isSavingEmpresa = false;
        console.error('Error guardando empresa', e);
        this.toastService.showError("Error al guardar la empresa.", "Error");
      }
    });
  }

  applyAdminFilter() {
    let filtered = this.locations;
    
    if (this.adminCompanyFilter) {
      filtered = filtered.filter(l => l.empresa === this.adminCompanyFilter);
    }
    
    if (this.adminSearchTerm && this.adminSearchTerm.trim() !== '') {
      const term = this.adminSearchTerm.toLowerCase().trim();
      const normalize = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
      const normTerm = normalize(term);
      
      filtered = filtered.filter(l => 
        normalize(l.nombre_destino).includes(normTerm) || 
        normalize(l.ubicacion?.municipio).includes(normTerm) ||
        normalize(l.ubicacion?.departamento).includes(normTerm)
      );
    }
    
    this.adminFilteredLocations = filtered;
    this.first = 0;
  }

  onPageChange(event: any) {
    this.first = event.first;
    this.rows = event.rows;
  }

  viewLocation(loc: any) {
    this.viewingLocation = loc;
  }

  closeViewDetails() {
    this.viewingLocation = null;
  }

  previewImage(url: string | null) {
    if (!url) return;
    this.previewImageEvent.emit(environment.apiUrl + url);
  }

  openEditFromView() {
    if (this.viewingLocation) {
      const loc = this.viewingLocation;
      // Do not set viewingLocation to null here, so we can return to it on cancel/save
      this.editLocation(loc);
    }
  }

  editLocation(loc: any) {
    this.editingLocation = loc;
    this.isMinimized = false;
    this.minimizeModalEvent.emit(false);
    this.editFormData = JSON.parse(JSON.stringify(loc));
    this.editLocationTab = 'datos';
    this.editImageFile = null;
    this.editImageUrl = loc.imagen_referencia ? `${environment.apiUrl}${loc.imagen_referencia}` : null;
    this.onDepartamentoChange();
    
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    this.editHorarios = dias.map(dia => {
      const existing = (loc.horarios_operativos || []).find((h: any) => h.dia_semana === dia);
      return {
        selected: !!existing,
        dia: dia,
        horaApertura: existing ? existing.hora_apertura : '08:00',
        horaCierre: existing ? existing.hora_cierre : '17:00'
      };
    });
  }

  onEditImageSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.editImageFile = file;
      this.isProcessingImage = true;
      const reader = new FileReader();
      reader.onload = e => {
        this.ngZone.run(() => {
          setTimeout(() => {
            this.editImageUrl = e.target?.result as string;
            this.isProcessingImage = false;
            this.cdr.detectChanges();
          }, 500); // Simulated delay for loading feedback
        });
      };
      reader.readAsDataURL(file);
    }
  }

  viewOnMap(loc: any) {
    this.viewOnMapEvent.emit(loc);
  }

  startPickingLocation() {
    this.requestMapPick.emit(this.editFormData);
  }

  // Se llama desde el contenedor (app.ts) cuando se selecciona el pin
  updatePickedLocation(lat: string, lng: string) {
    if (!this.editFormData.ubicacion) this.editFormData.ubicacion = {};
    this.editFormData.ubicacion.lat = lat;
    this.editFormData.ubicacion.lng = lng;
    this.cdr.detectChanges();
  }

  async onGoogleLinkPaste(event: ClipboardEvent) {
    const paste = event.clipboardData?.getData('text')?.trim();
    if (!paste) return;
    
    this.googleLinkError = '';
    
    const mapsLinkPattern = /^(https?:\/\/)?(www\.)?(maps\.app\.goo\.gl|goo\.gl\/maps|google\.com\/maps|maps\.google\.com)\/.*$/i;
    const directMatch =
      paste.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      paste.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
      paste.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/) ||
      paste.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);

    if (!paste.startsWith('http') && !directMatch) {
      return; // No es ni link ni coordenadas, ignorar aquí
    }

    if (paste.startsWith('http') && !mapsLinkPattern.test(paste)) {
       this.googleLinkError = 'URL no válida. Por favor, pega un enlace válido de Google Maps.';
       this.cdr.detectChanges();
       return;
    }
    
    if (paste.startsWith('http')) {
      this.editFormData.maps_url = paste;
    }
    
    const validateSV = (lat: number, lng: number) => {
      if (lat >= 13.0 && lat <= 14.5 && lng >= -90.2 && lng <= -87.6) return true;
      this.googleLinkError = 'Las coordenadas extraídas no pertenecen al territorio de El Salvador.';
      return false;
    };
    
    if (directMatch) {
      const lat = parseFloat(directMatch[1]);
      const lng = parseFloat(directMatch[2]);
      if (validateSV(lat, lng)) {
        if (!this.editFormData.ubicacion) this.editFormData.ubicacion = {};
        this.editFormData.ubicacion.lat = lat.toFixed(7);
        this.editFormData.ubicacion.lng = lng.toFixed(7);
      }
      this.cdr.detectChanges();
      return;
    }
    
    if (paste.startsWith('http')) {
      this.googleLinkLoading = true;
      this.cdr.detectChanges();
      this.mapasService.resolveMapsLink(paste).subscribe({
        next: (res: any) => {
          this.ngZone.run(() => {
            if (res?.success) {
              const lat = parseFloat(res.lat);
              const lng = parseFloat(res.lng);
              if (validateSV(lat, lng)) {
                if (!this.editFormData.ubicacion) this.editFormData.ubicacion = {};
                this.editFormData.ubicacion.lat = lat.toFixed(7);
                this.editFormData.ubicacion.lng = lng.toFixed(7);
              }
            } else {
              this.googleLinkError = '✅ URL guardada. Para extraer coordenadas automáticamente, copia el link completo.';
            }
            this.googleLinkLoading = false;
            this.cdr.detectChanges();
          });
        },
        error: () => {
          this.ngZone.run(() => {
            this.googleLinkError = '✅ URL guardada. No se pudo conectar al servidor para resolver las coordenadas.';
            this.googleLinkLoading = false;
            this.cdr.detectChanges();
          });
        }
      });
    }
  }

  minimizeModal() {
    this.isMinimized = true;
    this.minimizeModalEvent.emit(true);
    if (this.editFormData.ubicacion?.lat && this.editFormData.ubicacion?.lng) {
      this.previewMapEvent.emit({lat: this.editFormData.ubicacion.lat, lng: this.editFormData.ubicacion.lng});
    }
  }

  restoreModal() {
    this.isMinimized = false;
    this.minimizeModalEvent.emit(false);
  }

  cancelEdit() {
    if (this.isSavingLocation || this.googleLinkLoading) return;
    this.editingLocation = null;
    this.isMinimized = false;
    this.minimizeModalEvent.emit(false);
  }

  onDepartamentoChange() {
    if (this.editFormData.ubicacion?.departamento) {
      this.municipiosDisponibles = this.locationCatalog[this.editFormData.ubicacion.departamento] || [];
      if (!this.municipiosDisponibles.includes(this.editFormData.ubicacion.municipio)) {
        this.editFormData.ubicacion.municipio = '';
      }
    } else {
      this.municipiosDisponibles = [];
      this.editFormData.ubicacion.municipio = '';
    }
  }

  validateLocationForm(): boolean {
    const d = this.editFormData;
    if (!d.nombre_destino || d.nombre_destino.trim() === '') {
      this.toastService.showError("El nombre del destino es requerido.", "Validación"); return false;
    }
    if (!d.empresa) {
      this.toastService.showError("Debes seleccionar una empresa.", "Validación"); return false;
    }
    if (!d.ubicacion?.lat || !d.ubicacion?.lng) {
      this.toastService.showError("La latitud y longitud son requeridas.", "Validación"); return false;
    }
    const lat = parseFloat(d.ubicacion.lat);
    const lng = parseFloat(d.ubicacion.lng);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      this.toastService.showError("La latitud debe estar entre -90 y 90.", "Validación"); return false;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      this.toastService.showError("La longitud debe estar entre -180 y 180.", "Validación"); return false;
    }
    if (!d.ubicacion?.municipio || d.ubicacion.municipio.trim() === '') {
      this.toastService.showError("El municipio es requerido.", "Validación"); return false;
    }
    if (!d.ubicacion?.departamento || d.ubicacion.departamento.trim() === '') {
      this.toastService.showError("El departamento es requerido.", "Validación"); return false;
    }
    return true;
  }
  fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  async saveLocation() {
    if (!this.editingLocation) return;
    if (!this.validateLocationForm()) return;
    if (this.isSavingLocation) return;
    
    this.isSavingLocation = true;
    
    const payload: any = {
      nombre_destino: this.editFormData.nombre_destino,
      empresa: this.editFormData.empresa,
      maps_url: this.editFormData.maps_url || null,
      ubicacion: {
        lat: parseFloat(this.editFormData.ubicacion?.lat),
        lng: parseFloat(this.editFormData.ubicacion?.lng),
        municipio: this.editFormData.ubicacion?.municipio,
        departamento: this.editFormData.ubicacion?.departamento,
        direccion_referencia: this.editFormData.ubicacion?.direccion_referencia
      }
    };
    
    const activeHorarios = this.editHorarios
      .filter(h => h.selected)
      .map(h => ({
        dia_semana: h.dia,
        hora_apertura: h.horaApertura,
        hora_cierre: h.horaCierre
      }));
      
    payload.horarios = activeHorarios;

    if (this.editImageFile) {
      try {
        payload.imagen_referencia = await this.fileToBase64(this.editImageFile);
      } catch (e) {
        console.error("Error converting image to base64", e);
      }
    }

    this.ubicacionesService.updateLocation(this.editingLocation.id || this.editingLocation.id_destino, payload).subscribe({
      next: (res: any) => {
        this.ngZone.run(() => {
          this.isSavingLocation = false;
          this.editingLocation.nombre_destino = this.editFormData.nombre_destino;
          this.editingLocation.empresa = this.editFormData.empresa;
          this.editingLocation.maps_url = this.editFormData.maps_url || null;
          if (!this.editingLocation.ubicacion) this.editingLocation.ubicacion = {};
          this.editingLocation.ubicacion.lat = payload.ubicacion.lat;
          this.editingLocation.ubicacion.lng = payload.ubicacion.lng;
          this.editingLocation.ubicacion.municipio = payload.ubicacion.municipio;
          this.editingLocation.ubicacion.departamento = payload.ubicacion.departamento;
          this.editingLocation.ubicacion.direccion_referencia = payload.ubicacion.direccion_referencia;
          if (res.updated && res.updated.imagen_referencia) {
            this.editingLocation.imagen_referencia = res.updated.imagen_referencia;
          }
          this.editingLocation.horarios_operativos = activeHorarios;
          
          this.isSavedSuccess = true;
          this.cdr.detectChanges();
          this.toastService.showSuccess("El punto ha sido actualizado exitosamente.", "Guardado");
          
          // Retrasar el cierre del modal para mostrar el feedback visual de éxito
          setTimeout(() => {
            this.isSavedSuccess = false;
            this.editingLocation = null;
            this.applyAdminFilter();
            this.locationUpdated.emit(); // Inform parent to update map
            this.cdr.detectChanges();
          }, 1200);
        });
      },
      error: (err: any) => {
        this.ngZone.run(() => {
          this.isSavingLocation = false;
          console.error("Save error", err);
          this.toastService.showError("Error al guardar el punto. Revisa la consola.", "Error");
          this.cdr.detectChanges();
        });
      }
    });
  }

  formatTime(timeStr: string): string {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    let h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; 
    return `${h < 10 ? '0'+h : h}:${m} ${ampm}`;
  }

  getGroupedSchedules(horarios: any[]): { dias: string, apertura: string, cierre: string }[] {
    if (!horarios || horarios.length === 0) return [];
    
    const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    
    // 1. Group by time
    const timeGroups: { [key: string]: { apertura: string, cierre: string, days: number[] } } = {};
    
    for (const h of horarios) {
      if (!h.hora_apertura || !h.hora_cierre) continue;
      const key = `${h.hora_apertura}-${h.hora_cierre}`;
      const dayIndex = dayOrder.indexOf(h.dia_semana);
      if (dayIndex === -1) continue;
      
      if (!timeGroups[key]) {
        timeGroups[key] = { apertura: h.hora_apertura, cierre: h.hora_cierre, days: [] };
      }
      timeGroups[key].days.push(dayIndex);
    }
    
    const result: { dias: string, apertura: string, cierre: string }[] = [];
    
    // 2. For each time group, find consecutive ranges
    for (const key in timeGroups) {
      const group = timeGroups[key];
      // Sort days
      group.days.sort((a, b) => a - b);
      
      const ranges: string[] = [];
      let rangeStart = group.days[0];
      let rangeEnd = group.days[0];
      
      for (let i = 1; i < group.days.length; i++) {
        if (group.days[i] === rangeEnd + 1) {
          rangeEnd = group.days[i];
        } else {
          if (rangeStart === rangeEnd) {
            ranges.push(dayOrder[rangeStart]);
          } else if (rangeEnd === rangeStart + 1) {
            ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
          } else {
            ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
          }
          rangeStart = group.days[i];
          rangeEnd = group.days[i];
        }
      }
      
      if (rangeStart === rangeEnd) {
        ranges.push(dayOrder[rangeStart]);
      } else if (rangeEnd === rangeStart + 1) {
        ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
      } else {
        ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
      }
      
      // Join ranges with commas
      let diasLabel = ranges.join(', ');
      
      result.push({ dias: diasLabel, apertura: group.apertura, cierre: group.cierre });
    }
    
    // Sort result by the first day of the group (optional, but good for UX)
    result.sort((a, b) => {
       const getFirstDay = (label: string) => {
          for (let i=0; i<dayOrder.length; i++) {
            if (label.includes(dayOrder[i])) return i;
          }
          return 99;
       };
       return getFirstDay(a.dias) - getFirstDay(b.dias);
    });
    
    return result;
  }
}

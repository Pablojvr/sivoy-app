import { environment } from '../../../environments/environment';
import { Component, OnInit, ChangeDetectorRef, Output, EventEmitter, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-registro-punto',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro-punto.component.html',
  styleUrl: './registro-punto.component.css'
})
export class RegistroPuntoComponent implements OnInit {
  @Input() preselectedEmpresaId: number | null = null;
  @Input() preselectedEmpresaNombre: string = '';
  @Output() close = new EventEmitter<void>();

  onClose() {
    if (this.loading) return;
    this.close.emit();
  }

  // Step 1: Empresa
  empresas: any[] = [];
  selectedEmpresaId: number | null = null;

  // Step 2: Punto
  puntoNombre: string = '';
  puntoTipo: string = 'Agencia';
  puntoDepartamento: string = '';
  puntoMunicipio: string = '';
  puntoDireccion: string = '';
  puntoMapsUrl: string = '';
  puntoLat: number | null = null;
  puntoLng: number | null = null;
  puntoImagen: File | null = null;
  imagenPreview: string | null = null;

  // Step 3: Horarios
  diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  horarios: any = {};

  loading: boolean = false;
  errorMsg: string = '';
  isMinimized: boolean = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef, private toastService: ToastService) {
    // Initialize horarios map
    this.diasSemana.forEach(dia => {
      this.horarios[dia] = {
        activo: false,
        recepcion: { apertura: '08:00', cierre: '17:00' },
        envio: { apertura: '08:00', cierre: '17:00' },
        dual: { apertura: '08:00', cierre: '17:00' }
      };
    });
  }

  ngOnInit() {
    this.loadEmpresas();
  }

  loadEmpresas() {
    this.http.get<any>(environment.apiUrl + '/api/empresas').subscribe({
      next: (res) => {
        if (res.success) {
          this.empresas = res.empresas;
          if (this.preselectedEmpresaId) {
            this.selectedEmpresaId = Number(this.preselectedEmpresaId);
          }
        }
      },
      error: (err) => {
        console.error('Error fetching empresas', err);
      }
    });
  }

  getSelectedEmpresaNombre(): string {
    if (this.preselectedEmpresaNombre) {
      return this.preselectedEmpresaNombre;
    }
    if (!this.selectedEmpresaId) return '';
    const emp = this.empresas.find(e => e.id === this.selectedEmpresaId);
    return emp ? emp.nombre : '';
  }

  onImagenSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.puntoImagen = file;
      const reader = new FileReader();
      reader.onload = e => this.imagenPreview = e.target?.result as string;
      reader.readAsDataURL(file);
    }
  }

  onDragOver(event: any) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.add('drag-over');
  }

  onDragLeave(event: any) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
  }

  onDrop(event: any) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.classList.remove('drag-over');
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      this.puntoImagen = event.dataTransfer.files[0];
      const reader = new FileReader();
      reader.onload = e => this.imagenPreview = e.target?.result as string;
      reader.readAsDataURL(this.puntoImagen!);
    }
  }

  resolveMapsUrl() {
    if (!this.puntoMapsUrl) return;
    this.loading = true;
    this.http.post<any>(environment.apiUrl + '/api/resolve-maps-link', { url: this.puntoMapsUrl }).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.success) {
          this.puntoLat = res.lat;
          this.puntoLng = res.lng;
        } else {
          this.toastService.showError('No se pudieron extraer coordenadas del enlace.', 'Error de Maps');
        }
      },
      error: () => {
        this.loading = false;
        this.toastService.showError('Error al contactar al servidor para resolver las coordenadas.', 'Error de Conexión');
      }
    });
  }

  copyScheduleToAll() {
    const firstActiveDay = this.diasSemana.find(d => this.horarios[d].activo);
    if (!firstActiveDay) return;
    const source = this.horarios[firstActiveDay];
    this.diasSemana.forEach(dia => {
      if (dia !== firstActiveDay) {
        this.horarios[dia] = JSON.parse(JSON.stringify(source));
      }
    });
  }

  async save() {
    this.loading = true;
    this.errorMsg = '';

    try {
      if (!this.selectedEmpresaId) {
        throw new Error('Debes seleccionar una empresa.');
      }
      if (!this.puntoNombre || this.puntoNombre.trim() === '') {
        throw new Error('El nombre del destino es obligatorio.');
      }
      if (!this.puntoDepartamento || this.puntoDepartamento.trim() === '') {
        throw new Error('El departamento es obligatorio.');
      }
      if (!this.puntoMunicipio || this.puntoMunicipio.trim() === '') {
        throw new Error('El municipio es obligatorio.');
      }
      if (this.puntoLat === null || this.puntoLng === null || isNaN(this.puntoLat) || isNaN(this.puntoLng)) {
        throw new Error('La latitud y longitud son requeridas y deben ser numéricas.');
      }
      if (this.puntoLat < -90 || this.puntoLat > 90) {
        throw new Error('La latitud debe estar entre -90 y 90.');
      }
      if (this.puntoLng < -180 || this.puntoLng > 180) {
        throw new Error('La longitud debe estar entre -180 y 180.');
      }
      
      let empresaId = this.selectedEmpresaId;

      // 2. Preparar horarios
      const horariosArr: any[] = [];
      this.diasSemana.forEach(dia => {
        const h = this.horarios[dia];
        if (h.activo) {
          if (this.puntoTipo === 'Agencia') {
            horariosArr.push({ dia_semana: dia, hora_apertura: h.recepcion.apertura, hora_cierre: h.recepcion.cierre, tipo_accion: 'recibir' });
            horariosArr.push({ dia_semana: dia, hora_apertura: h.envio.apertura, hora_cierre: h.envio.cierre, tipo_accion: 'enviar' });
          } else {
            horariosArr.push({ dia_semana: dia, hora_apertura: h.dual.apertura, hora_cierre: h.dual.cierre, tipo_accion: 'ambos' });
          }
        }
      });

      // 3. Crear Punto
      const formData = new FormData();
      formData.append('nombre_destino', this.puntoNombre);
      formData.append('empresa_id', String(empresaId));
      formData.append('tipo', this.puntoTipo);
      formData.append('departamento', this.puntoDepartamento);
      formData.append('municipio', this.puntoMunicipio);
      formData.append('direccion_referencia', this.puntoDireccion);
      formData.append('maps_url', this.puntoMapsUrl);
      if (this.puntoLat) formData.append('lat', String(this.puntoLat));
      if (this.puntoLng) formData.append('lng', String(this.puntoLng));
      formData.append('horarios', JSON.stringify(horariosArr));
      
      if (this.puntoImagen) {
        formData.append('imagen_referencia', this.puntoImagen);
      }

      const res = await this.http.post<any>(environment.apiUrl + '/api/agencias', formData).toPromise();
      if (res.success) {
        this.toastService.showSuccess('El punto ha sido registrado exitosamente.', 'Registro Completado');
        this.close.emit();
      } else {
        throw new Error('Error al registrar punto');
      }

    } catch (e: any) {
      this.errorMsg = e.message || 'Error desconocido';
      this.toastService.showError(this.errorMsg, 'Error');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }
}

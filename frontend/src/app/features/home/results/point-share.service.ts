import { Injectable, InjectionToken, Inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

export interface ShareablePoint {
  nombre_destino?: string;
  destino_nombre?: string;
  destino_nombre_destino?: string;
  empresa?: string;
  direccion_referencia?: string;
  maps_url?: string;
  ubicacion?: {
    lat?: number | string;
    lng?: number | string;
    municipio?: string;
    departamento?: string;
  };
}

export interface BrowserPort {
  isShareSupported(): boolean;
  canShare(data: ShareData): boolean;
  share(data: ShareData): Promise<void>;
  createPngFile(imageUrl: string, fileName: string): Promise<File>;
  isWritePngSupported(): boolean;
  writePng(file: File): Promise<void>;
  isWriteTextSupported(): boolean;
  writeText(text: string): Promise<void>;
  legacyCopyText(text: string): Promise<void>;
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name: unknown }).name === 'AbortError';
}

export const BROWSER_PORT = new InjectionToken<BrowserPort>('BrowserPort', {
  providedIn: 'root',
  factory: () => new DefaultBrowserPort()
});

export class DefaultBrowserPort implements BrowserPort {
  private get isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof navigator !== 'undefined';
  }

  isShareSupported(): boolean {
    return this.isBrowser && typeof navigator.share === 'function';
  }

  canShare(data: ShareData): boolean {
    if (!this.isShareSupported()) return false;
    return typeof navigator.canShare === 'function' ? navigator.canShare(data) : true;
  }

  async share(data: ShareData): Promise<void> {
    if (!this.isShareSupported()) throw new Error('Web Share not supported');
    await navigator.share(data);
  }

  async createPngFile(url: string, fileName: string): Promise<File> {
    if (!this.isBrowser) throw new Error('Not in browser');
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`No se pudo cargar la imagen (${response.status})`);
    const sourceBlob = await response.blob();
    const imageBitmap = await createImageBitmap(sourceBlob);
    const maximumSide = 1800;
    const scale = Math.min(1, maximumSide / Math.max(imageBitmap.width, imageBitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
    canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no pudo preparar la imagen');
    context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    imageBitmap.close();
    
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo convertir la imagen')), 'image/png');
    });
    
    return new File([blob], fileName, { type: 'image/png' });
  }

  isWritePngSupported(): boolean {
    if (!this.isBrowser) return false;
    return !!(navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof (window as unknown as Record<string, unknown>)['ClipboardItem'] !== 'undefined');
  }

  async writePng(file: File): Promise<void> {
    if (!this.isWritePngSupported()) throw new Error('PNG clipboard not supported');
    const ClipboardItemConstructor = (window as unknown as Record<string, new (items: Record<string, File>) => unknown>)['ClipboardItem'];
    await navigator.clipboard.write([
      new ClipboardItemConstructor({ 'image/png': file }) as ClipboardItem
    ]);
  }

  isWriteTextSupported(): boolean {
    if (!this.isBrowser) return false;
    return !!(navigator.clipboard && typeof navigator.clipboard.writeText === 'function');
  }

  async writeText(text: string): Promise<void> {
    if (!this.isWriteTextSupported()) throw new Error('Clipboard writeText not supported');
    await navigator.clipboard.writeText(text);
  }

  async legacyCopyText(text: string): Promise<void> {
    if (!this.isBrowser) throw new Error('Not in browser');
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('El portapapeles no está disponible');
  }
}

@Injectable({
  providedIn: 'root'
})
export class PointShareService {
  constructor(
    @Inject(BROWSER_PORT) private browser: BrowserPort,
    private toastService: ToastService
  ) {}

  async sharePoint(loc: ShareablePoint, imageUrl?: string): Promise<void> {
    const title = this.getLocationName(loc);
    const text = this.buildPointShareText(loc);
    const mapUrl = loc.maps_url || this.buildGoogleMapsUrl(loc);

    if (this.browser.isShareSupported()) {
      try {
        if (imageUrl) {
          try {
            const fileName = `${this.safeFileName(title)}.png`;
            const imageFile = await this.browser.createPngFile(imageUrl, fileName);
            const imageShareData: ShareData = { files: [imageFile], title, text };
            if (this.browser.canShare(imageShareData)) {
              await this.browser.share(imageShareData);
              return;
            }
          } catch (error: unknown) {
            if (isAbortError(error)) return;
            console.warn('No se pudo adjuntar la imagen; se compartirá la información del punto.', error);
          }
        }

        await this.browser.share({ title, text, url: mapUrl });
        return;
      } catch (error: unknown) {
        if (isAbortError(error)) return;
        console.warn('No se pudo abrir el menú para compartir; se copiarán las indicaciones.', error);
      }
    }

    try {
      await this.copyText(text);
      this.toastService.showSuccess('Tu navegador no abrió el menú de compartir; copiamos la información para que puedas pegarla.', 'Información copiada');
    } catch (error: unknown) {
      console.error('No se pudo compartir la información del punto.', error);
      this.toastService.showError('Tu navegador bloqueó la acción. Intenta de nuevo desde HTTPS.', 'No se pudo compartir');
    }
  }

  async copyPoint(loc: ShareablePoint, imageUrl?: string): Promise<void> {
    if (imageUrl) {
      try {
        const title = this.getLocationName(loc);
        const fileName = `${this.safeFileName(title)}.png`;
        const imageFile = await this.browser.createPngFile(imageUrl, fileName);
        
        if (this.browser.isWritePngSupported()) {
          await this.browser.writePng(imageFile);
          this.toastService.showSuccess('La imagen del punto está lista para pegar en tu chat.', 'Imagen copiada');
          return;
        }

        const shareData: ShareData = { files: [imageFile], title, text: this.buildPointShareText(loc) };
        if (this.browser.isShareSupported() && this.browser.canShare(shareData)) {
          await this.browser.share(shareData);
          this.toastService.showSuccess('Selecciona dónde enviar la imagen del punto.', 'Imagen lista');
          return;
        }
      } catch (error: unknown) {
        if (isAbortError(error)) return;
        console.warn('No se pudo copiar la imagen; se copiarán las indicaciones.', error);
      }
    }

    try {
      await this.copyText(this.buildPointShareText(loc));
      this.toastService.showSuccess(
        imageUrl ? 'No fue posible copiar la imagen; copiamos las indicaciones y el enlace.' : 'Copiamos las indicaciones y el enlace del mapa.',
        'Información copiada'
      );
    } catch (error: unknown) {
      console.error('No se pudo copiar la información del punto.', error);
      this.toastService.showError('Tu navegador bloqueó el portapapeles. Intenta de nuevo desde HTTPS.', 'No se pudo copiar');
    }
  }

  private async copyText(text: string): Promise<void> {
    if (this.browser.isWriteTextSupported()) {
      await this.browser.writeText(text);
    } else {
      await this.browser.legacyCopyText(text);
    }
  }

  private getLocationName(location: ShareablePoint): string {
    return location.nombre_destino || location.destino_nombre || location.destino_nombre_destino || '';
  }

  private buildPointShareText(loc: ShareablePoint): string {
    const place = [loc.ubicacion?.municipio, loc.ubicacion?.departamento].filter(Boolean).join(', ');
    const address = loc.direccion_referencia ? `\nDirección: ${loc.direccion_referencia}` : '';
    const mapUrl = loc.maps_url || this.buildGoogleMapsUrl(loc);
    return `${this.getLocationName(loc)}\n${loc.empresa || 'Punto de entrega'}\n${place || 'El Salvador'}${address}\nMapa: ${mapUrl}`;
  }

  private buildGoogleMapsUrl(loc: ShareablePoint): string {
    const lat = loc.ubicacion?.lat;
    const lng = loc.ubicacion?.lng;
    if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${this.getLocationName(loc)} ${loc.ubicacion?.municipio || ''} El Salvador`)}`;
  }

  private safeFileName(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'punto-sivoy';
  }
}

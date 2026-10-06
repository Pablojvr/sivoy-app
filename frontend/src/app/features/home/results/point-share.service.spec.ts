import { TestBed } from '@angular/core/testing';
import { PointShareService, BROWSER_PORT, BrowserPort, ShareablePoint } from './point-share.service';
import { ToastService } from '../../../core/services/toast.service';
import { vi, Mock } from 'vitest';

describe('PointShareService', () => {
  let service: PointShareService;
  
  interface MockToastService {
    showSuccess: Mock;
    showError: Mock;
  }
  
  let mockToastService: MockToastService;
  
  interface MockBrowserPort extends BrowserPort {
    isShareSupported: Mock;
    canShare: Mock;
    share: Mock;
    createPngFile: Mock;
    isWritePngSupported: Mock;
    writePng: Mock;
    isWriteTextSupported: Mock;
    writeText: Mock;
    legacyCopyText: Mock;
  }
  
  let mockBrowser: MockBrowserPort;

  const mockPoint: ShareablePoint = {
    nombre_destino: 'Central Test',
    empresa: 'Test Express',
    ubicacion: { municipio: 'Test City', departamento: 'Test Dept', lat: 10, lng: 20 },
    direccion_referencia: 'Calle Falsa 123'
  };

  const abortError = new Error('Abort');
  abortError.name = 'AbortError';

  beforeEach(() => {
    mockToastService = {
      showSuccess: vi.fn(),
      showError: vi.fn()
    };

    mockBrowser = {
      isShareSupported: vi.fn().mockReturnValue(true),
      canShare: vi.fn().mockReturnValue(true),
      share: vi.fn(),
      createPngFile: vi.fn(),
      isWritePngSupported: vi.fn().mockReturnValue(true),
      writePng: vi.fn(),
      isWriteTextSupported: vi.fn().mockReturnValue(true),
      writeText: vi.fn(),
      legacyCopyText: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        PointShareService,
        { provide: ToastService, useValue: mockToastService },
        { provide: BROWSER_PORT, useValue: mockBrowser }
      ]
    });

    service = TestBed.inject(PointShareService);
  });

  describe('sharePoint', () => {
    it('should share image as PNG if imageUrl is provided and share is successful', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      
      await service.sharePoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.createPngFile).toHaveBeenCalledWith('http://test.com/image.jpg', 'central-test.png');
      expect(mockBrowser.share).toHaveBeenCalled();
      
      const shareArgs = mockBrowser.share.mock.calls[0][0];
      expect(shareArgs.files).toBeDefined();
      expect(shareArgs.files[0].name).toBe('central-test.png');
      expect(shareArgs.title).toBe('Central Test');
      expect(shareArgs.text).toContain('Calle Falsa 123');
    });

    it('should fallback to sharing text and URL if image processing fails', async () => {
      mockBrowser.createPngFile.mockRejectedValue(new Error('Fetch failed'));
      
      await service.sharePoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.share).toHaveBeenCalled();
      const shareArgs = mockBrowser.share.mock.calls[0][0];
      expect(shareArgs.files).toBeUndefined();
      expect(shareArgs.title).toBe('Central Test');
      expect(shareArgs.url).toBe('https://www.google.com/maps/search/?api=1&query=10,20');
    });
    
    it('should fallback to sharing text if canShare returns false for image', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.canShare.mockReturnValue(false); // Refuses image share
      
      await service.sharePoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.share).toHaveBeenCalled();
      const shareArgs = mockBrowser.share.mock.calls[0][0];
      expect(shareArgs.files).toBeUndefined(); // Should fallback to text
    });

    it('should return silently if AbortError is thrown during image share', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.share.mockRejectedValue(abortError);
      
      await service.sharePoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockToastService.showSuccess).not.toHaveBeenCalled();
      expect(mockToastService.showError).not.toHaveBeenCalled();
      expect(mockBrowser.share).toHaveBeenCalledTimes(1); 
    });

    it('should fallback to copy text if share throws a non-AbortError', async () => {
      mockBrowser.share.mockRejectedValue(new Error('Share not supported or failed'));
      mockBrowser.writeText.mockResolvedValue(undefined);
      
      await service.sharePoint(mockPoint);
      
      expect(mockBrowser.writeText).toHaveBeenCalled();
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'Tu navegador no abrió el menú de compartir; copiamos la información para que puedas pegarla.', 
        'Información copiada'
      );
    });

    it('should show error toast if writeText rejects and not call legacyCopyText', async () => {
      mockBrowser.isShareSupported.mockReturnValue(false); // Skips share
      mockBrowser.writeText.mockRejectedValue(new Error('Clipboard failed'));
      
      await service.sharePoint(mockPoint);
      
      expect(mockBrowser.legacyCopyText).not.toHaveBeenCalled();
      expect(mockToastService.showError).toHaveBeenCalledWith(
        'Tu navegador bloqueó la acción. Intenta de nuevo desde HTTPS.',
        'No se pudo compartir'
      );
    });

    it('should fallback to legacyCopyText if writeText is not supported', async () => {
      mockBrowser.isShareSupported.mockReturnValue(false); // Skips share
      mockBrowser.isWriteTextSupported.mockReturnValue(false);
      mockBrowser.legacyCopyText.mockResolvedValue(undefined);
      
      await service.sharePoint(mockPoint);
      
      expect(mockBrowser.writeText).not.toHaveBeenCalled();
      expect(mockBrowser.legacyCopyText).toHaveBeenCalled();
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'Tu navegador no abrió el menú de compartir; copiamos la información para que puedas pegarla.', 
        'Información copiada'
      );
    });
  });

  describe('copyPoint', () => {
    it('should copy PNG to clipboard if imageUrl is provided and API is supported', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.isWritePngSupported.mockReturnValue(true);
      
      await service.copyPoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.writePng).toHaveBeenCalledWith(mockFile);
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'La imagen del punto está lista para pegar en tu chat.',
        'Imagen copiada'
      );
    });
    
    it('should fallback to share file if writePng is not supported but share is', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.isWritePngSupported.mockReturnValue(false);
      mockBrowser.isShareSupported.mockReturnValue(true);
      mockBrowser.canShare.mockReturnValue(true);
      
      await service.copyPoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.share).toHaveBeenCalled();
      const shareArgs = mockBrowser.share.mock.calls[0][0];
      expect(shareArgs.files).toBeDefined();
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'Selecciona dónde enviar la imagen del punto.',
        'Imagen lista'
      );
    });

    it('should fallback to copy text if copy image fails', async () => {
      mockBrowser.createPngFile.mockRejectedValue(new Error('Fetch failed'));
      mockBrowser.writeText.mockResolvedValue(undefined);
      
      await service.copyPoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.writeText).toHaveBeenCalled();
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'No fue posible copiar la imagen; copiamos las indicaciones y el enlace.',
        'Información copiada'
      );
    });
    
    it('should fallback to text if canShare returns false', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.isWritePngSupported.mockReturnValue(false);
      mockBrowser.canShare.mockReturnValue(false);
      
      await service.copyPoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockBrowser.share).not.toHaveBeenCalled(); // Skips share
      expect(mockBrowser.writeText).toHaveBeenCalled();
    });
    
    it('should return silently if AbortError is thrown during copy', async () => {
      const mockFile = new File(['test'], 'central-test.png', { type: 'image/png' });
      mockBrowser.createPngFile.mockResolvedValue(mockFile);
      mockBrowser.writePng.mockRejectedValue(abortError);
      
      await service.copyPoint(mockPoint, 'http://test.com/image.jpg');
      
      expect(mockToastService.showSuccess).not.toHaveBeenCalled();
      expect(mockToastService.showError).not.toHaveBeenCalled();
      expect(mockBrowser.writeText).not.toHaveBeenCalled(); 
    });

    it('should fallback to legacyCopyText if writeText is not supported', async () => {
      mockBrowser.isWriteTextSupported.mockReturnValue(false);
      mockBrowser.legacyCopyText.mockResolvedValue(undefined);
      
      await service.copyPoint(mockPoint);
      
      expect(mockBrowser.writeText).not.toHaveBeenCalled();
      expect(mockBrowser.legacyCopyText).toHaveBeenCalled();
      expect(mockToastService.showSuccess).toHaveBeenCalledWith(
        'Copiamos las indicaciones y el enlace del mapa.',
        'Información copiada'
      );
    });
    
    it('should show error toast if writeText rejects without trying legacyCopyText', async () => {
      mockBrowser.isWriteTextSupported.mockReturnValue(true);
      mockBrowser.writeText.mockRejectedValue(new Error('Fail'));
      
      await service.copyPoint(mockPoint);
      
      expect(mockBrowser.legacyCopyText).not.toHaveBeenCalled();
      expect(mockToastService.showError).toHaveBeenCalledWith(
        'Tu navegador bloqueó el portapapeles. Intenta de nuevo desde HTTPS.',
        'No se pudo copiar'
      );
    });
  });
});

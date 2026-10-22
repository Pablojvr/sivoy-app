import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SiButtonDirective,
  SiButtonVariant,
  SiCardDirective,
  SiCardTone,
  SiChipComponent,
  SiChipTone,
  SiControlSize,
  SiIconButtonDirective,
  SiInputDirective,
  SiModalDirective,
  SiModalSize,
  SiSheetDirective,
  SiSheetState
} from './ui-primitives';

@Component({
  standalone: true,
  imports: [
    SiButtonDirective,
    SiIconButtonDirective,
    SiInputDirective,
    SiChipComponent,
    SiCardDirective,
    SiSheetDirective,
    SiModalDirective
  ],
  template: `
    <button
      siButton
      [variant]="buttonVariant"
      [size]="controlSize"
      [busy]="buttonBusy"
      [disabled]="buttonDisabled"
    >
      Continuar
    </button>

    <button
      siIconButton
      aria-label="Compartir punto"
      [variant]="iconVariant"
      [size]="controlSize"
      [busy]="iconBusy"
      [disabled]="iconDisabled"
    ></button>

    <input siInput aria-label="Buscar destino" [invalid]="inputInvalid" />
    <si-chip [tone]="chipTone">Disponible</si-chip>
    <article siCard [tone]="cardTone" [elevated]="cardElevated">Punto</article>
    <section siSheet aria-label="Detalle del punto" [state]="sheetState">Detalle</section>
    <dialog siModal aria-label="Confirmar acción" [size]="modalSize">Confirmación</dialog>
  `
})
class PrimitiveHostComponent {
  buttonVariant: SiButtonVariant = 'primary';
  iconVariant: SiButtonVariant = 'primary';
  controlSize: SiControlSize = 'md';
  buttonBusy = false;
  buttonDisabled = false;
  iconBusy = false;
  iconDisabled = false;
  inputInvalid = false;
  chipTone: SiChipTone = 'neutral';
  cardTone: SiCardTone = 'neutral';
  cardElevated = false;
  sheetState: SiSheetState = 'collapsed';
  modalSize: SiModalSize = 'md';
}

describe('SiVoy UI primitives', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimitiveHostComponent]
    }).compileComponents();
  });

  function render(overrides: Partial<PrimitiveHostComponent> = {}): ComponentFixture<PrimitiveHostComponent> {
    const fixture = TestBed.createComponent(PrimitiveHostComponent);
    Object.assign(fixture.componentInstance, overrides);
    fixture.detectChanges();
    return fixture;
  }

  it('expone variantes, tamaños y estados disabled/busy en botones', () => {
    const defaultFixture = render();
    const button = defaultFixture.nativeElement.querySelector('button[siButton]') as HTMLButtonElement;
    const iconButton = defaultFixture.nativeElement.querySelector('button[siIconButton]') as HTMLButtonElement;

    expect(button.classList.contains('si-button')).toBe(true);
    expect(button.dataset['size']).toBe('md');
    expect(button.getAttribute('aria-busy')).toBeNull();
    expect(iconButton.classList.contains('si-icon-button')).toBe(true);
    expect(iconButton.getAttribute('aria-label')).toBe('Compartir punto');
    expect(iconButton.getAttribute('aria-busy')).toBeNull();

    const activeFixture = render({
      buttonVariant: 'secondary',
      iconVariant: 'ghost',
      controlSize: 'lg',
      buttonBusy: true,
      iconBusy: true
    });
    const activeButton = activeFixture.nativeElement.querySelector('button[siButton]') as HTMLButtonElement;
    const activeIconButton = activeFixture.nativeElement.querySelector('button[siIconButton]') as HTMLButtonElement;

    expect(activeButton.classList.contains('si-button--secondary')).toBe(true);
    expect(activeButton.dataset['size']).toBe('lg');
    expect(activeButton.getAttribute('aria-busy')).toBe('true');
    expect(activeButton.disabled).toBe(true);
    expect(activeIconButton.classList.contains('si-icon-button--ghost')).toBe(true);
    expect(activeIconButton.dataset['size']).toBe('lg');
    expect(activeIconButton.getAttribute('aria-busy')).toBe('true');
    expect(activeIconButton.disabled).toBe(true);
  });

  it('expone estado inválido y tono semántico en input y chip', () => {
    const defaultFixture = render();
    const input = defaultFixture.nativeElement.querySelector('input[siInput]') as HTMLInputElement;
    const chip = defaultFixture.nativeElement.querySelector('si-chip') as HTMLElement;

    expect(input.classList.contains('si-input')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('aria-label')).toBe('Buscar destino');
    expect(chip.dataset['tone']).toBe('neutral');

    const invalidFixture = render({ inputInvalid: true, chipTone: 'success' });
    const invalidInput = invalidFixture.nativeElement.querySelector('input[siInput]') as HTMLInputElement;
    const successChip = invalidFixture.nativeElement.querySelector('si-chip') as HTMLElement;

    expect(invalidInput.classList.contains('si-input--invalid')).toBe(true);
    expect(invalidInput.getAttribute('aria-invalid')).toBe('true');
    expect(successChip.dataset['tone']).toBe('success');
  });

  it('conserva estados, tonos y nombres accesibles en card, sheet y modal', () => {
    const defaultFixture = render();
    const card = defaultFixture.nativeElement.querySelector('article[siCard]') as HTMLElement;
    const sheet = defaultFixture.nativeElement.querySelector('section[siSheet]') as HTMLElement;
    const modal = defaultFixture.nativeElement.querySelector('dialog[siModal]') as HTMLDialogElement;

    expect(card.classList.contains('si-card')).toBe(true);
    expect(card.dataset['tone']).toBe('neutral');
    expect(sheet.dataset['state']).toBe('collapsed');
    expect(sheet.getAttribute('aria-label')).toBe('Detalle del punto');
    expect(modal.dataset['size']).toBe('md');
    expect(modal.getAttribute('aria-modal')).toBe('true');
    expect(modal.getAttribute('aria-label')).toBe('Confirmar acción');

    const activeFixture = render({
      cardTone: 'info',
      cardElevated: true,
      sheetState: 'expanded',
      modalSize: 'lg'
    });
    const activeCard = activeFixture.nativeElement.querySelector('article[siCard]') as HTMLElement;
    const expandedSheet = activeFixture.nativeElement.querySelector('section[siSheet]') as HTMLElement;
    const largeModal = activeFixture.nativeElement.querySelector('dialog[siModal]') as HTMLDialogElement;

    expect(activeCard.classList.contains('si-card--elevated')).toBe(true);
    expect(activeCard.dataset['tone']).toBe('info');
    expect(expandedSheet.dataset['state']).toBe('expanded');
    expect(largeModal.dataset['size']).toBe('lg');
  });
});

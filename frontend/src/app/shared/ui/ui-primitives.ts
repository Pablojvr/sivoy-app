import { booleanAttribute, Component, Directive, input } from '@angular/core';

export type SiButtonVariant = 'primary' | 'secondary' | 'ghost';
export type SiControlSize = 'sm' | 'md' | 'lg';
export type SiChipTone = 'neutral' | 'accent' | 'success' | 'info' | 'warning';

@Directive({
  selector: 'button[siButton]',
  standalone: true,
  host: {
    class: 'si-button',
    '[class.si-button--secondary]': "variant() === 'secondary'",
    '[class.si-button--ghost]': "variant() === 'ghost'",
    '[attr.data-size]': 'size()',
    '[attr.aria-busy]': 'busy() || null',
    '[disabled]': 'disabled() || busy()',
    '[class.si-control--disabled]': 'disabled() || busy()'
  }
})
export class SiButtonDirective {
  readonly variant = input<SiButtonVariant>('primary');
  readonly size = input<SiControlSize>('md');
  readonly busy = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
}

@Directive({
  selector: 'button[siIconButton]',
  standalone: true,
  host: {
    class: 'si-icon-button',
    '[class.si-icon-button--secondary]': "variant() === 'secondary'",
    '[class.si-icon-button--ghost]': "variant() === 'ghost'",
    '[attr.data-size]': 'size()',
    '[attr.aria-label]': 'ariaLabel()',
    '[disabled]': 'disabled()',
    '[class.si-control--disabled]': 'disabled()'
  }
})
export class SiIconButtonDirective {
  readonly ariaLabel = input.required<string>({ alias: 'aria-label' });
  readonly variant = input<SiButtonVariant>('primary');
  readonly size = input<SiControlSize>('md');
  readonly disabled = input(false, { transform: booleanAttribute });
}

@Directive({
  selector: 'input[siInput], textarea[siInput]',
  standalone: true,
  host: {
    class: 'si-input',
    '[class.si-input--invalid]': 'invalid()',
    '[attr.aria-invalid]': 'invalid() || null'
  }
})
export class SiInputDirective {
  readonly invalid = input(false, { transform: booleanAttribute });
}

@Component({
  selector: 'si-chip',
  standalone: true,
  template: '<ng-content />',
  host: {
    class: 'si-chip',
    '[attr.data-tone]': 'tone()'
  }
})
export class SiChipComponent {
  readonly tone = input<SiChipTone>('neutral');
}

export type SiCardTone = 'neutral' | 'accent' | 'success' | 'info' | 'warning' | 'contrast';
export type SiSheetState = 'collapsed' | 'half' | 'expanded';
export type SiModalSize = 'sm' | 'md' | 'lg';

@Directive({
  selector: 'article[siCard], section[siCard]',
  standalone: true,
  host: {
    class: 'si-card',
    '[class.si-card--elevated]': 'elevated()',
    '[attr.data-tone]': 'tone()'
  }
})
export class SiCardDirective {
  readonly tone = input<SiCardTone>('neutral');
  readonly elevated = input(false, { transform: booleanAttribute });
}

@Directive({
  selector: 'section[siSheet]',
  standalone: true,
  host: {
    class: 'si-sheet',
    '[attr.data-state]': 'state()',
    '[attr.aria-label]': 'ariaLabel()'
  }
})
export class SiSheetDirective {
  readonly state = input<SiSheetState>('collapsed');
  readonly ariaLabel = input.required<string>({ alias: 'aria-label' });
}

@Directive({
  selector: 'dialog[siModal]',
  standalone: true,
  host: {
    class: 'si-modal',
    '[attr.data-size]': 'size()',
    '[attr.aria-modal]': '"true"'
  }
})
export class SiModalDirective {
  readonly size = input<SiModalSize>('md');
}

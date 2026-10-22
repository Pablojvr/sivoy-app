import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SiButtonDirective } from '../../../shared/ui/ui-primitives';

export type SearchState = 'loading' | 'error' | 'empty' | 'initial';

@Component({
  selector: 'si-search-state-card',
  standalone: true,
  imports: [SiButtonDirective],
  template: `
    <section
      class="search-state-surface"
      [attr.data-state]="state()"
      [attr.role]="semanticRole()"
      [attr.aria-live]="liveMode()"
      [attr.aria-busy]="state() === 'loading' ? 'true' : null"
    >
      <span class="search-state-icon" aria-hidden="true">
        @switch (state()) {
          @case ('loading') {
            <svg class="search-state-spinner" viewBox="0 0 24 24" focusable="false">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 4a8 8 0 0 1 8 8" />
            </svg>
          }
          @case ('error') {
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 3 2.8 19h18.4L12 3Z" />
              <path d="M12 9v4.5" />
              <path d="M12 17h.01" />
            </svg>
          }
          @case ('empty') {
            <svg viewBox="0 0 24 24" focusable="false">
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m15.4 15.4 4.1 4.1" />
              <path d="M8 10.5h5" />
            </svg>
          }
          @default {
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 21s7-5.2 7-12a7 7 0 1 0-14 0c0 6.8 7 12 7 12Z" />
              <circle cx="12" cy="9" r="2.4" />
            </svg>
          }
        }
      </span>

      <div class="search-state-copy">
        <h3>{{ title() }}</h3>
        <p>{{ message() }}</p>
      </div>

      @if (actionLabel()) {
        <button
          siButton
          class="search-state-action"
          type="button"
          [variant]="state() === 'initial' ? 'primary' : 'secondary'"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
    </section>
  `,
  styleUrl: './search-state-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchStateCardComponent {
  readonly state = input.required<SearchState>();
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();

  readonly semanticRole = computed(() => {
    if (this.state() === 'loading') return 'status';
    if (this.state() === 'error') return 'alert';
    return null;
  });

  readonly liveMode = computed(() => {
    if (this.state() === 'loading') return 'polite';
    if (this.state() === 'error') return 'assertive';
    return null;
  });
}

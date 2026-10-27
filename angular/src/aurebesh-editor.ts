/**
 * Angular wrapper around <aurebesh-editor>: a standalone component that works with `ngModel`, `formControl` and
 * `formControlName`, and has inputs and outputs for the rest. No CUSTOM_ELEMENTS_SCHEMA is needed. For signal forms
 * (`[formField]`) use `AurebeshField`.
 *
 *     import { AurebeshEditor } from 'aurebesh/angular';
 *     <aurebesh-angular [(ngModel)]="html" [options]="options" placeholder="Start typing..." />
 *
 * Keep `options` stable (define it once): a new object with the same content is ignored, but a new inline function (for
 * example an upload adapter) rebuilds the editor.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, booleanAttribute, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { AurebeshBase } from './base';

@Component({
  selector: 'aurebesh-angular',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block', '(focusout)': 'onTouched()' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AurebeshEditor), multi: true }],
})
export class AurebeshEditor extends AurebeshBase implements ControlValueAccessor {
  /** The HTML, for use without forms (`[value]`, or `[(value)]` with `valueChange`). */
  @Input() value?: string | null;
  @Input() maxLength?: number;
  @Input({ transform: booleanAttribute }) readOnly = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input() name?: string;

  /** The HTML after every change. */
  @Output() valueChange = new EventEmitter<string>();

  private disabled = false;
  private onChange: (html: string) => void = () => {};
  private touched: () => void = () => {};

  // ---- ControlValueAccessor ----------------------------------------------------------------------------------------

  writeValue(html: string | null): void {
    this.setValue(html ?? '');
  }

  registerOnChange(fn: (html: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.touched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
    this.syncReadOnly();
  }

  /** Called by the host element when the focus leaves the editor. */
  onTouched(): void {
    this.touched();
  }

  protected isReadOnly(): boolean {
    return this.readOnly || this.disabled;
  }

  protected changed(html: string): void {
    this.onChange(html);
    this.valueChange.emit(html);
  }
}

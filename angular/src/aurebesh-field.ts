/**
 * Angular wrapper around <aurebesh-editor> for signal forms: a standalone component that implements `FormValueControl<string>`,
 * so that the `FormField` directive binds it to a field. The form gives the value and the state (disabled, read-only, required,
 * name, max length); the editor marks the field as touched when the focus leaves it.
 *
 *     import { AurebeshField } from 'aurebesh/angular';
 *     import { FormField, form } from '@angular/forms/signals';
 *     <aurebesh-field [formField]="noteForm.body" placeholder="Start typing..." />
 *
 * The other inputs and outputs are those of `AurebeshEditor`. For `ngModel`, `formControl` and `formControlName` use
 * `AurebeshEditor`.
 */
import { ChangeDetectionStrategy, Component, EventEmitter, Output, booleanAttribute, input, model } from '@angular/core';
import { AurebeshBase } from './base';

@Component({
  selector: 'aurebesh-field',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block', '(focusout)': 'onTouched()' },
})
export class AurebeshField extends AurebeshBase {
  /** The HTML: set by `[formField]`, or `[(value)]` without a form. */
  readonly value = model('');
  /** Angular 21 marks the field as touched when this becomes true; Angular 22 listens to `touch`. */
  readonly touched = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly name = input('');
  readonly maxLength = input<number | undefined>(undefined);

  /** The focus left the editor. */
  @Output() touch = new EventEmitter<void>();

  /** Called by the form, for example to show the first field with an error. */
  focus(): void {
    this.editor?.focus();
  }

  /** Called by the host element when the focus leaves the editor. */
  onTouched(): void {
    this.touched.set(true);
    this.touch.emit();
  }

  protected isReadOnly(): boolean {
    return this.readonly() || this.disabled();
  }

  protected changed(html: string): void {
    this.value.set(html);
  }
}

/**
 * Angular wrapper around <aurebesh-editor>: a standalone component that works with `ngModel`, `formControl` and
 * `formControlName`, and has inputs and outputs for the rest. No CUSTOM_ELEMENTS_SCHEMA is needed.
 *
 *     import { AurebeshEditor } from 'aurebesh/angular';
 *     <aurebesh-angular [(ngModel)]="html" [options]="options" placeholder="Start typing..." />
 *
 * Keep `options` stable (define it once): a new object with the same content is ignored, but a new inline function (for
 * example an upload adapter) rebuilds the editor.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  booleanAttribute,
  forwardRef,
  inject,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type { Aurebesh, AurebeshOptions, Layout, ResolvedPage, TextStats } from 'aurebesh';
import type { AurebeshElement } from 'aurebesh/element';

/** The inputs that are attributes of the element, with the name of the attribute. */
const ATTRIBUTES: Record<string, string> = {
  placeholder: 'placeholder',
  page: 'page',
  pageOrientation: 'page-orientation',
  pageMargin: 'page-margin',
  maxLength: 'maxlength',
  name: 'name',
  format: 'format',
};
const FLAGS: Record<string, string> = { counter: 'counter', required: 'required' };

@Component({
  selector: 'aurebesh-angular',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:block', '(focusout)': 'onTouched()' },
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => AurebeshEditor), multi: true }],
})
export class AurebeshEditor implements ControlValueAccessor, AfterViewInit, OnChanges, OnDestroy {
  /** The HTML, for use without forms (`[value]`, or `[(value)]` with `valueChange`). */
  @Input() value?: string | null;
  /** Everything that cannot be an attribute (media adapter, fonts, colours, labels, plugins...). */
  @Input() options?: AurebeshOptions;
  @Input() placeholder?: string;
  /** Page format: 'a4', 'a5', 'ticket-80', ..., or a width such as '600px' / '80mm' (a number is px). */
  @Input() page?: string | number;
  @Input() pageOrientation?: 'portrait' | 'landscape';
  @Input() pageMargin?: string;
  @Input() maxLength?: number;
  @Input({ transform: booleanAttribute }) counter = false;
  @Input({ transform: booleanAttribute }) readOnly = false;
  @Input({ transform: booleanAttribute }) required = false;
  @Input() name?: string;
  /** What is submitted with a native form: 'html' (default), 'markdown', 'text', or a format that a plugin adds. */
  @Input() format?: string;
  @Input() toolbar?: string[];
  @Input() quickbar?: string[];

  /** The HTML after every change. */
  @Output() valueChange = new EventEmitter<string>();
  @Output() ready = new EventEmitter<Aurebesh>();
  @Output() count = new EventEmitter<TextStats>();
  @Output() pageChange = new EventEmitter<ResolvedPage | null>();
  @Output() layoutChange = new EventEmitter<Layout>();
  @Output() error = new EventEmitter<Error>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private element: AurebeshElement | null = null;
  private loading = false;
  private destroyed = false;
  private disabled = false;
  /** The HTML as the editor has it, or what was asked for before the editor existed. */
  private current = '';
  private onChange: (html: string) => void = () => {};
  private touched: () => void = () => {};

  /** The element of the editor, once it exists (after the view was initialised in the browser). */
  get editorElement(): AurebeshElement | null {
    return this.element;
  }

  /** The editor itself (see `ready`), or null before it exists. */
  get editor(): Aurebesh | null {
    return this.element?.instance ?? null;
  }

  ngAfterViewInit(): void {
    void this.start();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.value !== undefined) this.setValue(this.value ?? '');
    if (!this.element) return;
    if (changes['toolbar'] || changes['quickbar']) {
      this.recreate(); // the toolbar is read when the editor is built
      return;
    }
    for (const name of Object.keys(ATTRIBUTES)) if (changes[name]) this.attribute(ATTRIBUTES[name], this.input(name));
    for (const name of Object.keys(FLAGS)) if (changes[name]) this.element.toggleAttribute(FLAGS[name], !!this.input(name));
    if (changes['readOnly']) this.syncReadOnly();
    if (changes['options']) this.element.options = this.options ?? {};
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.element?.remove();
    this.element = null;
  }

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

  // ---- the element --------------------------------------------------------------------------------------------------

  private async start(): Promise<void> {
    if (!this.browser || this.loading || this.element) return;
    this.loading = true;
    try {
      await import('aurebesh/element'); // registers <aurebesh-editor>; not at the top, so that server rendering never loads it
    } finally {
      this.loading = false;
    }
    if (!this.destroyed && !this.element) this.create();
  }

  private create(): void {
    const el = document.createElement('aurebesh-editor') as AurebeshElement;
    for (const name of Object.keys(ATTRIBUTES)) this.attribute(ATTRIBUTES[name], this.input(name), el);
    for (const name of Object.keys(FLAGS)) el.toggleAttribute(FLAGS[name], !!this.input(name));
    el.toggleAttribute('readonly', this.readOnly || this.disabled);
    if (this.toolbar) el.setAttribute('toolbar', this.toolbar.join(','));
    if (this.quickbar) el.setAttribute('quickbar', this.quickbar.join(','));
    if (this.options) el.options = this.options;
    el.value = this.current;

    // The listeners are added outside the zone, so that the events inside the editor (selection, mouse...) do not start change
    // detection; only what is passed on to the application runs inside it.
    const emit = (fn: () => void) => this.zone.run(fn);
    // The events of the element bubble up to this component, where Angular would also hand them to an output with the same name
    // (`(count)`, `(error)`): so they stop here, and the outputs are the way to listen.
    const listen = <T>(name: string, fn: (detail: T) => void) =>
      el.addEventListener(name, (e) => {
        e.stopPropagation();
        fn((e as CustomEvent<T>).detail);
      });
    listen<string>('change', (html) => {
      this.current = html;
      emit(() => {
        this.onChange(html);
        this.valueChange.emit(html);
      });
    });
    listen<Aurebesh>('ready', (editor) => emit(() => this.ready.emit(editor)));
    listen<TextStats>('count', (stats) => emit(() => this.count.emit(stats)));
    listen<ResolvedPage | null>('page', (page) => emit(() => this.pageChange.emit(page)));
    listen<Layout>('layout', (layout) => emit(() => this.layoutChange.emit(layout)));
    listen<Error>('error', (error) => emit(() => this.error.emit(error)));
    this.zone.runOutsideAngular(() => this.host.nativeElement.appendChild(el));
    this.element = el;
  }

  private recreate(): void {
    this.current = this.element?.value ?? this.current;
    this.element?.remove();
    this.element = null;
    this.create();
  }

  private setValue(html: string): void {
    if (html === this.current && this.element) return;
    this.current = html;
    if (this.element) this.element.value = html;
  }

  private syncReadOnly(): void {
    this.element?.toggleAttribute('readonly', this.readOnly || this.disabled);
  }

  /** The value of an input, by name. */
  private input(name: string): unknown {
    return (this as unknown as Record<string, unknown>)[name];
  }

  private attribute(name: string, value: unknown, el: AurebeshElement | null = this.element): void {
    if (!el) return;
    if (value === undefined || value === null || value === '') el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }
}

/**
 * What the Angular components have in common: the inputs and outputs that are not about the value, and the <aurebesh-editor>
 * element that they build in the browser. `AurebeshEditor` adds the value for `ngModel` / `formControl`, `AurebeshField` for
 * signal forms (`[formField]`).
 */
import { isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit,
  Directive,
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
  inject,
  isSignal,
} from '@angular/core';
import type { Aurebesh, AurebeshOptions, CommentEvent, CommentThread, Layout, MentionUser, ResolvedPage, SuggestionEvent, TextStats, ImportResult } from 'aurebesh';
import type { AurebeshElement } from 'aurebesh/element';

/** The inputs that are attributes of the element, with the name of the attribute. */
const ATTRIBUTES: Record<string, string> = {
  placeholder: 'placeholder',
  language: 'language',
  page: 'page',
  pageOrientation: 'page-orientation',
  pageMargin: 'page-margin',
  maxLength: 'maxlength',
  name: 'name',
  format: 'format',
};
const FLAGS: Record<string, string> = { counter: 'counter', required: 'required' };
/** The inputs that make the editor read-only (of one component or the other). */
const READ_ONLY = ['readOnly', 'readonly', 'disabled'];

@Directive()
export abstract class AurebeshBase implements AfterViewInit, OnChanges, OnDestroy {
  /** Everything that cannot be an attribute (media adapter, fonts, colours, labels, plugins...). */
  @Input() options?: AurebeshOptions;
  @Input() placeholder?: string;
  /** The language of the texts of the editor: 'nl', 'de', 'fr', 'es', 'en'. Default: the `lang` of the page, or the language of the browser. */
  @Input() language?: string;
  /** Page format: 'a4', 'a5', 'ticket-80', ..., or a width such as '600px' / '80mm' (a number is px). */
  @Input() page?: string | number;
  @Input() pageOrientation?: 'portrait' | 'landscape';
  @Input() pageMargin?: string;
  @Input({ transform: booleanAttribute }) counter = false;
  /** What is submitted with a native form: 'html' (default), 'markdown', 'text', or a format that a plugin adds. */
  @Input() format?: string;
  @Input() toolbar?: string[];
  @Input() quickbar?: string[];

  @Output() ready = new EventEmitter<Aurebesh>();
  @Output() count = new EventEmitter<TextStats>();
  /** A person was picked in the mentions list (see the `mentions` option). */
  @Output() mention = new EventEmitter<MentionUser>();
  /** What happened to a comment (see the `comments` option). */
  @Output() comment = new EventEmitter<CommentEvent>();
  /** All the threads of comments after every change: what to save next to the HTML. */
  @Output() comments = new EventEmitter<CommentThread[]>();
  /** A suggestion was accepted or rejected (see the `suggestions` option). */
  @Output() suggestion = new EventEmitter<SuggestionEvent>();
  /** Suggestion mode was switched on or off. */
  @Output() suggesting = new EventEmitter<boolean>();
  /** A file was opened in the editor (the `import` item, or `importFile`). */
  @Output() imported = new EventEmitter<ImportResult>();
  /** The user changed the height of the editor (see the `resizable` option): the height in pixels, or null. */
  @Output() resized = new EventEmitter<number | null>();
  @Output() pageChange = new EventEmitter<ResolvedPage | null>();
  @Output() layoutChange = new EventEmitter<Layout>();
  @Output() error = new EventEmitter<Error>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private element: AurebeshElement | null = null;
  private loading = false;
  private destroyed = false;
  /** The HTML as the editor has it, or what was asked for before the editor existed. */
  private current = '';

  /** The element of the editor, once it exists (after the view was initialised in the browser). */
  get editorElement(): AurebeshElement | null {
    return this.element;
  }

  /** The editor itself (see `ready`), or null before it exists. */
  get editor(): Aurebesh | null {
    return this.element?.instance ?? null;
  }

  /** Whether the editor is read-only now. */
  protected abstract isReadOnly(): boolean;
  /** The user changed the text (called inside the zone). */
  protected abstract changed(html: string): void;

  ngAfterViewInit(): void {
    void this.start();
  }

  ngOnChanges(changes: SimpleChanges): void {
    const value = this.input('value') as string | null | undefined;
    if (changes['value'] && value !== undefined) this.setValue(value ?? '');
    if (!this.element) return;
    if (changes['toolbar'] || changes['quickbar']) {
      this.recreate(); // the toolbar is read when the editor is built
      return;
    }
    for (const name of Object.keys(ATTRIBUTES)) if (changes[name]) this.attribute(ATTRIBUTES[name], this.input(name));
    for (const name of Object.keys(FLAGS)) if (changes[name]) this.element.toggleAttribute(FLAGS[name], !!this.input(name));
    if (READ_ONLY.some((name) => changes[name])) this.syncReadOnly();
    if (changes['options']) this.element.options = this.options ?? {};
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.element?.remove();
    this.element = null;
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
    el.toggleAttribute('readonly', this.isReadOnly());
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
      emit(() => this.changed(html));
    });
    listen<Aurebesh>('ready', (editor) => emit(() => this.ready.emit(editor)));
    listen<TextStats>('count', (stats) => emit(() => this.count.emit(stats)));
    listen<MentionUser>('mention', (user) => emit(() => this.mention.emit(user)));
    listen<CommentEvent>('comment', (event) => emit(() => this.comment.emit(event)));
    listen<CommentThread[]>('comments', (threads) => emit(() => this.comments.emit(threads)));
    listen<SuggestionEvent>('suggestion', (event) => emit(() => this.suggestion.emit(event)));
    listen<boolean>('suggesting', (on) => emit(() => this.suggesting.emit(on)));
    listen<ImportResult>('imported', (result) => emit(() => this.imported.emit(result)));
    listen<number | null>('resized', (height) => emit(() => this.resized.emit(height)));
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

  protected setValue(html: string): void {
    if (html === this.current && this.element) return;
    this.current = html;
    if (this.element) this.element.value = html;
  }

  protected syncReadOnly(): void {
    this.element?.toggleAttribute('readonly', this.isReadOnly());
  }

  /** The value of an input, by name (also of a signal input). */
  private input(name: string): unknown {
    const value = (this as unknown as Record<string, unknown>)[name];
    return isSignal(value) ? value() : value;
  }

  private attribute(name: string, value: unknown, el: AurebeshElement | null = this.element): void {
    if (!el) return;
    if (value === undefined || value === null || value === '') el.removeAttribute(name);
    else el.setAttribute(name, String(value));
  }
}

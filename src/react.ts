/**
 * React wrapper around <aurebesh-editor>. React 18 doesn't set properties on custom elements,
 * so this component sets `value`/`options` and listens for events itself.
 *
 *   import { AurebeshEditor } from 'aurebesh/react';
 *   <AurebeshEditor value={html} onChange={setHtml} options={options} />
 *
 * Keep `options` stable (define it outside the component or useMemo it): a new object with the same
 * content is ignored, but a new inline function (e.g. an upload adapter) rebuilds the editor.
 */
import { createElement, forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { defineAurebeshElement } from './element';
import type { AurebeshElement } from './element';
import type { Aurebesh, AurebeshOptions } from './editor';
import type { ResolvedPage } from './page';
import type { TextStats } from './stats';
import type { MentionUser } from './mentions';
import type { CommentEvent, CommentThread } from './comments';
import type { SuggestionEvent } from './suggestions';

export interface AurebeshEditorProps {
  /** Controlled HTML. Pair it with `onChange`. */
  value?: string;
  /** Initial HTML when you don't control the value. */
  defaultValue?: string;
  onChange?: (html: string) => void;
  onError?: (error: Error) => void;
  /** Called once when the editor is built. */
  onReady?: (editor: Aurebesh) => void;
  /** Called when the words / characters change. */
  onCount?: (stats: TextStats) => void;
  /** Called when a person is picked in the mentions list (see the `mentions` option). */
  onMention?: (user: MentionUser) => void;
  /** Called when a comment is added, replied to, resolved, reopened or deleted (see the `comments` option). */
  onComment?: (event: CommentEvent) => void;
  /** Called with all the threads of comments after every change: what to save next to the HTML. */
  onComments?: (threads: CommentThread[]) => void;
  /** Called when a suggestion is accepted or rejected (see the `suggestions` option). */
  onSuggestion?: (event: SuggestionEvent) => void;
  /** Called when suggestion mode is switched on or off. */
  onSuggesting?: (on: boolean) => void;
  options?: AurebeshOptions;
  /** The language of the texts of the editor: 'nl', 'de', 'fr', 'es', 'en'. Default: the `lang` of the page, or the language of the browser. */
  language?: string;
  /** Page format: 'a4', 'a5', 'ticket-80', ..., or a width such as '600px' / '80mm' (a number is px). The editor shows a sheet of that size. */
  page?: string | number;
  pageOrientation?: 'portrait' | 'landscape';
  pageMargin?: string;
  /** Called when the page format changes (also from the toolbar's `page` item); null is responsive. */
  onPageChange?: (page: ResolvedPage | null) => void;
  /** Maximum number of characters; typing and pasting stop at the limit. */
  maxLength?: number;
  /** Show "12 words · 80 / 500 characters" under the text. */
  counter?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  /** Form field name: the HTML is submitted with the surrounding <form>. */
  name?: string;
  toolbar?: string[];
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export const AurebeshEditor = forwardRef<AurebeshElement, AurebeshEditorProps>(function AurebeshEditor(props, ref) {
  defineAurebeshElement();
  const { value, defaultValue, onChange, onError, onReady, onCount, onMention, onComment, onComments, onSuggestion, onSuggesting, onPageChange, options, language, page, pageOrientation, pageMargin, maxLength, counter, placeholder, readOnly, required, name, toolbar, id, className, style } = props;
  const el = useRef<AurebeshElement | null>(null);
  useImperativeHandle(ref, () => el.current as AurebeshElement);
  const handlers = useRef({ onChange, onError, onReady, onCount, onMention, onComment, onComments, onSuggestion, onSuggesting, onPageChange });
  handlers.current = { onChange, onError, onReady, onCount, onMention, onComment, onComments, onSuggestion, onSuggesting, onPageChange };

  // Layout effects run right after the element is inserted, before it creates its editor.
  useLayoutEffect(() => {
    if (options && el.current) el.current.options = options;
  }, [options]);

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const initial = value ?? defaultValue;
    if (initial !== undefined) node.value = initial;
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- defaultValue only matters on the first run

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const change = (e: Event) => handlers.current.onChange?.((e as CustomEvent<string>).detail);
    const error = (e: Event) => handlers.current.onError?.((e as CustomEvent<Error>).detail);
    const ready = (e: Event) => handlers.current.onReady?.((e as CustomEvent<Aurebesh>).detail);
    const count = (e: Event) => handlers.current.onCount?.((e as CustomEvent<TextStats>).detail);
    const mention = (e: Event) => handlers.current.onMention?.((e as CustomEvent<MentionUser>).detail);
    const comment = (e: Event) => handlers.current.onComment?.((e as CustomEvent<CommentEvent>).detail);
    const comments = (e: Event) => handlers.current.onComments?.((e as CustomEvent<CommentThread[]>).detail);
    const suggestion = (e: Event) => handlers.current.onSuggestion?.((e as CustomEvent<SuggestionEvent>).detail);
    const suggesting = (e: Event) => handlers.current.onSuggesting?.((e as CustomEvent<boolean>).detail);
    const pageChange = (e: Event) => handlers.current.onPageChange?.((e as CustomEvent<ResolvedPage | null>).detail);
    node.addEventListener('page', pageChange);
    node.addEventListener('change', change);
    node.addEventListener('error', error);
    node.addEventListener('ready', ready);
    node.addEventListener('count', count);
    node.addEventListener('mention', mention);
    node.addEventListener('comment', comment);
    node.addEventListener('comments', comments);
    node.addEventListener('suggestion', suggestion);
    node.addEventListener('suggesting', suggesting);
    return () => {
      node.removeEventListener('page', pageChange);
      node.removeEventListener('change', change);
      node.removeEventListener('error', error);
      node.removeEventListener('ready', ready);
      node.removeEventListener('count', count);
      node.removeEventListener('mention', mention);
      node.removeEventListener('comment', comment);
      node.removeEventListener('comments', comments);
      node.removeEventListener('suggestion', suggestion);
      node.removeEventListener('suggesting', suggesting);
    };
  }, []);

  return createElement('aurebesh-editor', {
    ref: el,
    id,
    name,
    class: className,
    style,
    placeholder,
    language,
    page: page === undefined ? undefined : String(page),
    'page-orientation': pageOrientation,
    'page-margin': pageMargin,
    maxlength: maxLength,
    counter: counter ? '' : undefined,
    toolbar: toolbar?.join(','),
    readonly: readOnly ? '' : undefined,
    required: required ? '' : undefined,
  });
});

export type { AurebeshElement, AurebeshOptions };

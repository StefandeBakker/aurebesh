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
import type { TextStats } from './stats';

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
  options?: AurebeshOptions;
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
  const { value, defaultValue, onChange, onError, onReady, onCount, options, maxLength, counter, placeholder, readOnly, required, name, toolbar, id, className, style } = props;
  const el = useRef<AurebeshElement | null>(null);
  useImperativeHandle(ref, () => el.current as AurebeshElement);
  const handlers = useRef({ onChange, onError, onReady, onCount });
  handlers.current = { onChange, onError, onReady, onCount };

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
    node.addEventListener('change', change);
    node.addEventListener('error', error);
    node.addEventListener('ready', ready);
    node.addEventListener('count', count);
    return () => {
      node.removeEventListener('change', change);
      node.removeEventListener('error', error);
      node.removeEventListener('ready', ready);
      node.removeEventListener('count', count);
    };
  }, []);

  return createElement('aurebesh-editor', {
    ref: el,
    id,
    name,
    class: className,
    style,
    placeholder,
    maxlength: maxLength,
    counter: counter ? '' : undefined,
    toolbar: toolbar?.join(','),
    readonly: readOnly ? '' : undefined,
    required: required ? '' : undefined,
  });
});

export type { AurebeshElement, AurebeshOptions };

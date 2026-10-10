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
import type { AurebeshOptions } from './editor';

export interface AurebeshEditorProps {
  /** Controlled HTML. Pair it with `onChange`. */
  value?: string;
  /** Initial HTML when you don't control the value. */
  defaultValue?: string;
  onChange?: (html: string) => void;
  onError?: (error: Error) => void;
  options?: AurebeshOptions;
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
  const { value, defaultValue, onChange, onError, options, placeholder, readOnly, required, name, toolbar, id, className, style } = props;
  const el = useRef<AurebeshElement | null>(null);
  useImperativeHandle(ref, () => el.current as AurebeshElement);
  const handlers = useRef({ onChange, onError });
  handlers.current = { onChange, onError };

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
    node.addEventListener('change', change);
    node.addEventListener('error', error);
    return () => {
      node.removeEventListener('change', change);
      node.removeEventListener('error', error);
    };
  }, []);

  return createElement('aurebesh-editor', {
    ref: el,
    id,
    name,
    class: className,
    style,
    placeholder,
    toolbar: toolbar?.join(','),
    readonly: readOnly ? '' : undefined,
    required: required ? '' : undefined,
  });
});

export type { AurebeshElement, AurebeshOptions };

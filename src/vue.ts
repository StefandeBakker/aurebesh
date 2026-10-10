/**
 * Vue 3 wrapper around <aurebesh-editor> with v-model.
 *
 *   import { AurebeshEditor } from 'aurebesh/vue';
 *   <AurebeshEditor v-model="html" :options="options" />
 *
 * Keep `options` stable (define it once): a new object with the same content is ignored,
 * but a new inline function (e.g. an upload adapter) rebuilds the editor.
 */
import { defineComponent, h } from 'vue';
import type { PropType } from 'vue';
import { defineAurebeshElement } from './element';
import type { AurebeshElement } from './element';
import type { AurebeshOptions } from './editor';

export const AurebeshEditor = defineComponent({
  name: 'AurebeshEditor',
  props: {
    modelValue: { type: String, default: undefined },
    options: { type: Object as PropType<AurebeshOptions>, default: undefined },
    placeholder: { type: String, default: undefined },
    readOnly: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    name: { type: String, default: undefined },
    toolbar: { type: Array as PropType<string[]>, default: undefined },
  },
  emits: {
    'update:modelValue': (html: string) => typeof html === 'string',
    change: (html: string) => typeof html === 'string',
    error: (error: Error) => error instanceof Error,
  },
  setup(props, { emit }) {
    defineAurebeshElement();
    return () =>
      h('aurebesh-editor', {
        // `value` and `options` are properties of the element, which Vue sets as such.
        value: props.modelValue,
        options: props.options,
        name: props.name,
        placeholder: props.placeholder,
        toolbar: props.toolbar?.join(','),
        readonly: props.readOnly ? '' : undefined,
        required: props.required ? '' : undefined,
        onChange: (e: CustomEvent<string>) => {
          emit('update:modelValue', e.detail);
          emit('change', e.detail);
        },
        onError: (e: CustomEvent<Error>) => emit('error', e.detail),
      });
  },
});

export type { AurebeshElement, AurebeshOptions };

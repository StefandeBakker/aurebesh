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
import { defineAurebeshElement } from './element-class';
import type { AurebeshElement } from './element-class';
import type { Aurebesh, AurebeshOptions } from './editor';
import type { ResolvedPage } from './page';
import type { TextStats } from './stats';
import type { MentionUser } from './mentions';
import type { CommentEvent, CommentThread } from './comments';
import type { SuggestionEvent } from './suggestions';
import type { ImportResult } from './import';

export const AurebeshEditor = defineComponent({
  name: 'AurebeshEditor',
  props: {
    modelValue: { type: String, default: undefined },
    options: { type: Object as PropType<AurebeshOptions>, default: undefined },
    placeholder: { type: String, default: undefined },
    /** The language of the texts of the editor: 'nl', 'de', 'fr', 'es', 'en'. Default: the `lang` of the page, or the language of the browser. */
    language: { type: String, default: undefined },
    /** Page format: 'a4', 'a5', 'ticket-80', ..., or a width such as '600px' / '80mm' (a number is px). */
    page: { type: [String, Number] as PropType<string | number>, default: undefined },
    pageOrientation: { type: String as PropType<'portrait' | 'landscape'>, default: undefined },
    pageMargin: { type: String, default: undefined },
    maxLength: { type: Number, default: undefined },
    counter: { type: Boolean, default: false },
    readOnly: { type: Boolean, default: false },
    required: { type: Boolean, default: false },
    name: { type: String, default: undefined },
    toolbar: { type: Array as PropType<string[]>, default: undefined },
  },
  emits: {
    'update:modelValue': (html: string) => typeof html === 'string',
    change: (html: string) => typeof html === 'string',
    error: (error: Error) => error instanceof Error,
    ready: (editor: Aurebesh) => !!editor,
    count: (stats: TextStats) => !!stats,
    mention: (user: MentionUser) => !!user,
    comment: (event: CommentEvent) => !!event,
    comments: (threads: CommentThread[]) => Array.isArray(threads),
    suggestion: (event: SuggestionEvent) => !!event,
    suggesting: (on: boolean) => typeof on === 'boolean',
    imported: (result: ImportResult) => !!result,
    pageChange: (page: ResolvedPage | null) => page === null || typeof page === 'object',
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
        language: props.language,
        page: props.page === undefined ? undefined : String(props.page),
        'page-orientation': props.pageOrientation,
        'page-margin': props.pageMargin,
        maxlength: props.maxLength,
        counter: props.counter ? '' : undefined,
        toolbar: props.toolbar?.join(','),
        readonly: props.readOnly ? '' : undefined,
        required: props.required ? '' : undefined,
        onChange: (e: CustomEvent<string>) => {
          emit('update:modelValue', e.detail);
          emit('change', e.detail);
        },
        onError: (e: CustomEvent<Error>) => emit('error', e.detail),
        onReady: (e: CustomEvent<Aurebesh>) => emit('ready', e.detail),
        onCount: (e: CustomEvent<TextStats>) => emit('count', e.detail),
        onMention: (e: CustomEvent<MentionUser>) => emit('mention', e.detail),
        onComment: (e: CustomEvent<CommentEvent>) => emit('comment', e.detail),
        onComments: (e: CustomEvent<CommentThread[]>) => emit('comments', e.detail),
        onSuggestion: (e: CustomEvent<SuggestionEvent>) => emit('suggestion', e.detail),
        onSuggesting: (e: CustomEvent<boolean>) => emit('suggesting', e.detail),
        onImported: (e: CustomEvent<ImportResult>) => emit('imported', e.detail),
        onPage: (e: CustomEvent<ResolvedPage | null>) => emit('pageChange', e.detail),
      });
  },
});

export type { AurebeshElement, AurebeshOptions };

import { createApp, h, ref } from 'vue';
import { AurebeshEditor } from '../../../src/vue';

createApp({
  setup() {
    const html = ref('<p>start</p>');
    return () =>
      h('form', { id: 'form' }, [
        // inline options literal on purpose: a new object on every render must not rebuild the editor
        h(AurebeshEditor, {
          modelValue: html.value,
          'onUpdate:modelValue': (v: string) => (html.value = v),
          name: 'body',
          options: { labels: { bold: 'Vet' }, toolbar: ['bold', 'italic'] },
        }),
        h('pre', { id: 'out' }, html.value),
        h('button', { type: 'button', id: 'reset', onClick: () => (html.value = '<p>from vue</p>') }, 'reset'),
      ]);
  },
}).mount('#root');

import { createElement as h, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AurebeshEditor } from '../../../src/react';

function App() {
  const [html, setHtml] = useState('<p>start</p>');
  return h(
    'form',
    { id: 'form' },
    // `options` is an inline literal on purpose: a new object on every render must not rebuild the editor.
    h(AurebeshEditor, { value: html, onChange: setHtml, name: 'body', options: { labels: { bold: 'Vet' }, toolbar: ['bold', 'italic'] } }),
    h('pre', { id: 'out' }, html),
    h('button', { type: 'button', id: 'reset', onClick: () => setHtml('<p>from react</p>') }, 'reset'),
  );
}

createRoot(document.getElementById('root')!).render(h(App));

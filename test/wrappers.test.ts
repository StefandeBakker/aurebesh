// @vitest-environment node
// No DOM here on purpose: this is what importing and server-rendering looks like in Next.js / Nuxt.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString as renderVue } from 'vue/server-renderer';
import { AurebeshEditor as ReactEditor } from '../src/react';
import { AurebeshEditor as VueEditor } from '../src/vue';

describe('server side', () => {
  it('the core and the element can be imported without a DOM', async () => {
    const core = await import('../src/index');
    expect(typeof core.Aurebesh).toBe('function');
    const el = await import('../src/element');
    expect(typeof el.AurebeshElement).toBe('function');
    expect(() => el.defineAurebeshElement()).not.toThrow();
  });

  it('the React wrapper renders the custom element tag with its attributes', () => {
    const out = renderToString(createElement(ReactEditor, { name: 'body', placeholder: 'Type', readOnly: true, toolbar: ['bold', 'italic'] }));
    expect(out).toContain('<aurebesh-editor');
    expect(out).toContain('name="body"');
    expect(out).toContain('placeholder="Type"');
    expect(out).toContain('toolbar="bold,italic"');
    expect(out).toContain('readonly');
  });

  it('the Vue wrapper renders the custom element tag', async () => {
    const app = createSSRApp({ render: () => h(VueEditor, { modelValue: '<p>x</p>', name: 'body' }) });
    const out = await renderVue(app);
    expect(out).toContain('<aurebesh-editor');
    expect(out).toContain('name="body"');
  });
});

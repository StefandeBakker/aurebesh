import { describe, expect, it, vi } from 'vitest';
import { Aurebesh, definePlugin } from '../src';
import { extendToolbar } from '../src/plugin';
import type { AurebeshPlugin, PluginContext, PluginInstance } from '../src';

const host = () => {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
};

/** A plugin that uses every hook, and keeps track of what the editor did with it. */
function toy(extra: Partial<AurebeshPlugin> = {}, instance: Partial<PluginInstance> = {}) {
  const log: string[] = [];
  let ctx!: PluginContext;
  const plugin = definePlugin({
    name: 'toy',
    css: '.toy-marker{color:red}',
    labels: { hello: 'Say hello', 'ui.toy.note': 'A note' },
    commands: { hello: { name: 'hello', label: 'Hi', title: 'Hello', run: () => log.push('run') } },
    setup(context: PluginContext): PluginInstance {
      ctx = context;
      log.push('setup');
      return {
        attach: () => log.push('attach'),
        input: () => log.push('input'),
        readOnlyChanged: () => log.push('readonly'),
        destroy: () => log.push('destroy'),
        ...instance,
      };
    },
    ...extra,
  });
  return { plugin, log, ctx: () => ctx };
}

describe('plugins: toolbar', () => {
  it('adds its commands as ordinary buttons in the blocks of the toolbar, with its own label as the tooltip', () => {
    const { plugin, log } = toy();
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['#Toy', 'hello', '|', 'bold'] });
    const btn = el.querySelector('button.aurebesh-cmd-hello') as HTMLButtonElement;
    expect(btn.title).toBe('Say hello'); // the label of the plugin
    expect(btn.closest('.aurebesh-group')!.querySelector('.aurebesh-group-label')!.textContent).toBe('Toy');
    btn.click();
    expect(log).toContain('run');
    el.remove();
  });

  it('lets the user label win over the label of the plugin', () => {
    const { plugin } = toy();
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['hello'], labels: { hello: 'Zeg hallo' } });
    expect((el.querySelector('button.aurebesh-cmd-hello') as HTMLButtonElement).title).toBe('Zeg hallo');
    el.remove();
  });

  it('can give the default toolbar, which a toolbar of the user replaces; and then there is no strip', () => {
    const { plugin } = toy({}, { toolbar: ['hello', 'bold'] });
    const a = host();
    new Aurebesh(a, { plugins: [plugin] });
    expect(Array.from(a.querySelectorAll('.aurebesh-toolbar button')).map((b) => b.getAttribute('title'))).toEqual(['Say hello', 'Bold']);
    expect(a.querySelector('.aurebesh-quickbar')).toBeNull();
    a.remove();
    const b = host();
    new Aurebesh(b, { plugins: [plugin], toolbar: ['italic'] });
    expect(Array.from(b.querySelectorAll('.aurebesh-toolbar button')).map((x) => x.getAttribute('title'))).toEqual(['Italic']);
    b.remove();
  });

  it('can build an item itself, and an item that is not its own is left to the editor', () => {
    const own = document.createElement('span');
    own.className = 'own-item';
    const { plugin } = toy({}, { buildItem: (item) => (item === 'special' ? own : undefined) });
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['special', 'bold'] });
    expect(el.querySelector('.own-item')).toBe(own);
    expect(el.querySelector('button[title="Bold"]')).not.toBeNull();
    el.remove();
  });

  it('draws icons of its own', () => {
    const { plugin } = toy({
      icons: { star: [['path', { d: 'M12 3l3 6 6 1-4.5 4.5L17.5 21 12 18l-5.5 3 1-6.5L3 10l6-1z' }]] },
      commands: { hello: { name: 'hello', icon: 'star', label: 'Hi', title: 'Hello', run: () => {} } },
    });
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['hello'] });
    expect(el.querySelector('button.aurebesh-cmd-hello svg.aurebesh-icon path')).not.toBeNull();
    el.remove();
  });
});

describe('plugins: life of the editor', () => {
  it('is set up before the toolbar, attached once the editor exists, and told about typing, read-only and the end', () => {
    const { plugin, log } = toy();
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    expect(log.slice(0, 2)).toEqual(['setup', 'attach']);
    ed.setHTML('<p>a</p>');
    expect(log).toContain('input');
    ed.setReadOnly(true);
    expect(log).toContain('readonly');
    ed.destroy();
    expect(log[log.length - 1]).toBe('destroy');
    el.remove();
  });

  it('has the content and the stage from attach on', () => {
    let seen: { content: boolean; stage: boolean } | null = null;
    const { plugin, ctx } = toy();
    const p = definePlugin({
      ...plugin,
      setup(c) {
        const inst = plugin.setup(c);
        return { ...inst, attach: () => (seen = { content: c.content instanceof HTMLElement, stage: c.stage instanceof HTMLElement }) };
      },
    });
    const el = host();
    new Aurebesh(el, { plugins: [p] });
    expect(seen).toEqual({ content: true, stage: true });
    expect(ctx().root).toBeInstanceOf(HTMLElement);
    el.remove();
  });

  it('adds its styles to the page once, however many editors', () => {
    const { plugin } = toy();
    const a = host();
    const b = host();
    new Aurebesh(a, { plugins: [plugin] });
    new Aurebesh(b, { plugins: [plugin] });
    expect(document.head.querySelectorAll('style[data-aurebesh-plugin="toy"]')).toHaveLength(1);
    a.remove();
    b.remove();
  });

  it('gives its api under its name, and nothing for another name', () => {
    const { plugin } = toy({}, { api: { answer: () => 42 } });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    expect(ed.plugin<{ answer(): number }>('toy')!.answer()).toBe(42);
    expect(ed.plugin('other')).toBeUndefined();
    el.remove();
  });

  it('turns the markdown shortcuts off when it asks for it, unless the user says otherwise', () => {
    const { plugin } = toy({}, { markdownShortcuts: false });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    expect((ed as unknown as { markdown: boolean }).markdown).toBe(false);
    const on = new Aurebesh(host(), { plugins: [plugin], markdownShortcuts: true });
    expect((on as unknown as { markdown: boolean }).markdown).toBe(true);
    el.remove();
  });
});

describe('plugins: events and output', () => {
  it('sends its events to the listeners of the editor', () => {
    const { plugin, ctx } = toy({ events: ['toy'] });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    const seen = vi.fn();
    ed.on('toy', seen);
    ctx().emit('toy', { n: 1 });
    expect(seen).toHaveBeenCalledWith({ n: 1 });
    el.remove();
  });

  it('adds an output format', () => {
    const { plugin } = toy({}, { output: { toy: () => 'TOY' } });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin], value: '<p>x</p>' });
    expect(ed.getValue('toy')).toBe('TOY');
    expect(ed.hasOutput('toy')).toBe(true);
    expect(ed.hasOutput('nope')).toBe(false);
    expect(ed.getValue('html')).toBe('<p>x</p>');
    el.remove();
  });
});

describe('plugins: keys, paste and drop', () => {
  it('can take a key over: the editor then leaves it alone', () => {
    const handled: string[] = [];
    const { plugin } = toy({}, { keydown: (e) => (e.key === 'k' && e.ctrlKey ? (handled.push('k'), true) : false) });
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['link'] });
    const content = el.querySelector('.aurebesh-content')!;
    content.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(handled).toEqual(['k']);
    expect(el.querySelector('input[inputmode="url"]')!.closest('.aurebesh-table-pop')!.hasAttribute('hidden')).toBe(true); // the link box did not open
    el.remove();
  });

  it('can take paste and drop over', () => {
    const calls: string[] = [];
    const { plugin } = toy({}, { paste: () => (calls.push('paste'), true), drop: () => (calls.push('drop'), true) });
    const el = host();
    new Aurebesh(el, { plugins: [plugin] });
    const content = el.querySelector('.aurebesh-content')!;
    content.dispatchEvent(new Event('paste', { bubbles: true, cancelable: true }));
    content.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(calls).toEqual(['paste', 'drop']);
    el.remove();
  });
});

describe('plugins: sanitizer', () => {
  const ext = {
    attributes: { span: ['data-toy'] },
    clean: (el: Element) => {
      if (el.hasAttribute('data-toy') && !/^[a-z]{1,8}$/.test(el.getAttribute('data-toy')!)) el.removeAttribute('data-toy');
    },
  };

  it('keeps what the plugin allows, in its own editor only, and cleans it with its hook', () => {
    const { plugin } = toy({ sanitize: ext });
    const a = host();
    const withToy = new Aurebesh(a, { plugins: [plugin] });
    withToy.setHTML('<p><span data-toy="ok">a</span><span data-toy="no way!">b</span></p>');
    expect(withToy.getHTML()).toBe('<p><span data-toy="ok">a</span>b</p>');
    const b = host();
    const plain = new Aurebesh(b, {});
    plain.setHTML('<p><span data-toy="ok">a</span></p>');
    expect(plain.getHTML()).toBe('<p>a</p>');
    a.remove();
    b.remove();
  });
});

describe('plugins: panels in the sidebar', () => {
  const panel = (id: string, title: string) => ({ id, title, label: title.slice(0, 1), build: () => Object.assign(document.createElement('div'), { className: `pane-${id}`, textContent: title }) });

  it('opens and closes a panel with the toolbar item of the same name', () => {
    const { plugin } = toy({ panels: [panel('notes', 'Notes')] });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin], toolbar: ['bold', 'notes'] });
    const btn = el.querySelector('button.aurebesh-cmd-notes') as HTMLButtonElement;
    const side = el.querySelector('.aurebesh-panel') as HTMLElement;
    expect(side.hidden).toBe(true);
    expect(btn.title).toBe('Notes');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-controls')).toBe(side.id);
    const seen: (string | null)[] = [];
    ed.on('panel', (id) => seen.push(id));
    btn.click();
    expect(side.hidden).toBe(false);
    expect(side.querySelector('.pane-notes')).not.toBeNull();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(ed.getOpenPanel()).toBe('notes');
    btn.click();
    expect(side.hidden).toBe(true);
    expect(seen).toEqual(['notes', null]);
    el.remove();
  });

  it('has no sidebar for a panel that is not in the toolbar', () => {
    const { plugin } = toy({ panels: [panel('notes', 'Notes')] });
    const el = host();
    new Aurebesh(el, { plugins: [plugin], toolbar: ['bold'] });
    expect(el.querySelector('.aurebesh-panel')).toBeNull();
    el.remove();
  });

  it('shows tabs when there are several panels, one at a time, and the header title when there is one', () => {
    const { plugin } = toy({ panels: [panel('notes', 'Notes')] });
    const one = host();
    new Aurebesh(one, { plugins: [plugin], toolbar: ['notes'] }).openPanel('notes');
    expect(one.querySelector('.aurebesh-panel-head strong')!.textContent).toBe('Notes');
    expect(one.querySelector('[role="tablist"]')).toBeNull();
    one.remove();

    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin], toolbar: ['layout', 'notes'] });
    ed.openPanel('notes');
    const tabs = Array.from(el.querySelectorAll('[role="tab"]')) as HTMLElement[];
    expect(tabs.map((t) => t.textContent)).toEqual(['Layout', 'Notes']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    const panes = Array.from(el.querySelectorAll('.aurebesh-panel-pane')) as HTMLElement[];
    expect(panes.map((p) => p.hidden)).toEqual([true, false]);
    tabs[0].click();
    expect(ed.getOpenPanel()).toBe('layout');
    expect(Array.from(el.querySelectorAll('.aurebesh-panel-pane')).map((p) => (p as HTMLElement).hidden)).toEqual([false, true]);
    expect(el.querySelector('button.aurebesh-cmd-layout')!.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('button.aurebesh-cmd-notes')!.getAttribute('aria-expanded')).toBe('false');
    el.remove();
  });

  it('closes with the cross and with Escape, and the focus goes back to the toolbar item', () => {
    const { plugin } = toy({ panels: [panel('notes', 'Notes')] });
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin], toolbar: ['notes'] });
    ed.openPanel('notes');
    (el.querySelector('.aurebesh-panel-close') as HTMLButtonElement).click();
    expect(ed.getOpenPanel()).toBeNull();
    ed.openPanel('notes');
    el.querySelector('.aurebesh-panel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ed.getOpenPanel()).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('button.aurebesh-cmd-notes'));
    el.remove();
  });
});

describe('plugins: toolbarExtend', () => {
  it('puts items after or before an item, or at the end when there is no such item', () => {
    expect(extendToolbar(['bold', 'italic'], [{ after: 'bold', items: ['|', 'field'] }])).toEqual(['bold', '|', 'field', 'italic']);
    expect(extendToolbar(['bold', 'italic'], [{ before: 'bold', items: ['field'] }])).toEqual(['field', 'bold', 'italic']);
    expect(extendToolbar(['bold'], [{ after: 'nope', items: ['field'] }])).toEqual(['bold', 'field']);
    expect(extendToolbar(['bold'], [{ items: ['field'] }])).toEqual(['bold', 'field']);
  });

  it('does not add a name the toolbar has already, nor a lone separator', () => {
    expect(extendToolbar(['field', 'bold'], [{ after: 'bold', items: ['|', 'field'] }])).toEqual(['field', 'bold']);
  });

  it('also reaches a toolbar that the user gives, but not "no toolbar"', () => {
    const { plugin } = toy({}, { toolbarExtend: [{ after: 'bold', items: ['hello'] }] });
    const a = host();
    new Aurebesh(a, { plugins: [plugin], toolbar: ['bold', 'italic'] });
    expect(Array.from(a.querySelectorAll('.aurebesh-toolbar button')).map((b) => b.className.match(/aurebesh-cmd-(\w+)/)?.[1])).toEqual(['bold', 'hello', 'italic']);
    a.remove();
    const b = host();
    new Aurebesh(b, { plugins: [plugin], toolbar: [] });
    expect(b.querySelector('button.aurebesh-cmd-hello')).toBeNull();
    b.remove();
  });
});

describe('plugins: load and setValue', () => {
  const csv = (extra = {}) =>
    toy(extra, {
      output: { csv: () => 'a,b' },
      load: { csv: (value: string) => value.split(',').map((v) => `<p>${v}</p>`).join('') },
    });

  it('reads a format of a plugin, the other side of its output', () => {
    const { plugin } = csv();
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    ed.setValue('x,y', 'csv');
    expect(ed.getHTML()).toBe('<p>x</p><p>y</p>');
    ed.setValue('<p>z</p>');
    expect(ed.getHTML()).toBe('<p>z</p>');
    el.remove();
  });

  it('throws for a format that no plugin reads', () => {
    const el = host();
    const ed = new Aurebesh(el);
    expect(() => ed.setValue('x', 'csv')).toThrow(/csv/);
    el.remove();
  });
});

describe('plugins: insert', () => {
  /** jsdom has no isContentEditable: follow contentEditable, as a browser does. */
  const editable = (el: HTMLElement) => {
    const content = el.querySelector('.aurebesh-content') as HTMLElement;
    Object.defineProperty(content, 'isContentEditable', { get: () => content.contentEditable === 'true' });
  };

  const withExec = (fn: (exec: ReturnType<typeof vi.fn>) => void) => {
    const exec = vi.fn(() => true);
    const original = document.execCommand;
    document.execCommand = exec as unknown as typeof document.execCommand;
    try {
      fn(exec);
    } finally {
      document.execCommand = original;
    }
  };

  it('sanitizes what is inserted, and keeps what the plugin allows', () => {
    const { plugin, ctx } = toy({ sanitize: { attributes: { span: ['data-field'] } } });
    const el = host();
    new Aurebesh(el, { plugins: [plugin] });
    editable(el);
    withExec((exec) => {
      expect(ctx().insert('<span data-field="name" onclick="x()">Name</span><script>1</script>')).toBe(true);
      expect(exec).toHaveBeenCalledWith('insertHTML', false, '<span data-field="name">Name</span>');
    });
    el.remove();
  });

  it('takes a node too, and leaves the original where it is', () => {
    const { plugin, ctx } = toy({ sanitize: { attributes: { span: ['data-field'] } } });
    const el = host();
    new Aurebesh(el, { plugins: [plugin] });
    editable(el);
    const chip = document.createElement('span');
    chip.dataset.field = 'id';
    chip.textContent = 'ID';
    const origin = host();
    origin.appendChild(chip);
    withExec((exec) => {
      expect(ctx().insert(chip)).toBe(true);
      expect(exec).toHaveBeenCalledWith('insertHTML', false, '<span data-field="id">ID</span>');
    });
    expect(origin.contains(chip)).toBe(true);
    origin.remove();
    el.remove();
  });

  it('inserts nothing when the editor is read-only, or when nothing is left after sanitizing', () => {
    const { plugin, ctx } = toy();
    const el = host();
    const ed = new Aurebesh(el, { plugins: [plugin] });
    editable(el);
    withExec((exec) => {
      expect(ctx().insert('<script>1</script>')).toBe(false);
      ed.setReadOnly(true);
      expect(ctx().insert('<p>x</p>')).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });
    el.remove();
  });

  it('inserts nothing for a point outside the text', () => {
    const { plugin, ctx } = toy();
    const el = host();
    new Aurebesh(el, { plugins: [plugin] });
    editable(el);
    withExec((exec) => {
      expect(ctx().insert('<p>x</p>', { x: -1, y: -1 })).toBe(false);
      expect(exec).not.toHaveBeenCalled();
    });
    el.remove();
  });
});

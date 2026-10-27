// @vitest-environment jsdom
/**
 * The same checks on what is published: the output of `npm run build:angular` (partially compiled Angular code), linked the way the
 * Angular CLI does when an application is built. Skipped when the package was not built.
 */
import '@angular/compiler';
import 'zone.js';
import 'zone.js/testing';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const built = resolve(process.cwd(), 'dist/angular/fesm2022/aurebesh-angular.mjs');
const linkedDir = resolve(process.cwd(), 'angular/.linked') + '/';
/** Signal forms, from Angular 21 on: the test with `[formField]` is skipped with an older Angular. */
const signalFormsEntry = '@angular/forms/signals';
const signalForms = (await import(/* @vite-ignore */ signalFormsEntry).catch(() => null)) as Record<string, any> | null;

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let i = 0; i < 40; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 5));
  }
}

function type(el: HTMLElement, html: string): void {
  const content = el.querySelector('.aurebesh-content') as HTMLElement;
  content.innerHTML = html;
  content.dispatchEvent(new Event('input', { bubbles: true }));
}

describe.skipIf(!existsSync(built))('aurebesh/angular as published', () => {
  let AurebeshEditor: unknown;
  // The signal inputs of AurebeshField (`model()`, `input()`) are found by the Angular compiler, so it is tested here, built.
  let AurebeshField: unknown;

  beforeAll(async () => {
    const { transformFileSync } = await import('@babel/core');
    const { createEs2015LinkerPlugin } = await import('@angular/compiler-cli/linker/babel');
    const { NodeJSFileSystem, ConsoleLogger, LogLevel } = await import('@angular/compiler-cli');
    const result = transformFileSync(built, {
      plugins: [createEs2015LinkerPlugin({ fileSystem: new NodeJSFileSystem(), logger: new ConsoleLogger(LogLevel.warn), linkerJitMode: false })],
      filename: built,
      compact: false,
      sourceMaps: false,
      babelrc: false,
      configFile: false,
    });
    expect(result?.code).not.toContain('ɵɵngDeclare'); // the linker turned the declarations into code that runs
    mkdirSync(linkedDir, { recursive: true });
    const out = `${linkedDir}aurebesh-angular.mjs`;
    writeFileSync(out, result!.code!);
    ({ AurebeshEditor, AurebeshField } = await import(/* @vite-ignore */ pathToFileURL(out).href));

    const attach = HTMLElement.prototype.attachInternals;
    HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
      const internals = (attach ? attach.call(this) : {}) as Record<string, unknown>;
      internals['setFormValue'] ??= () => {};
      internals['setValidity'] ??= () => {};
      return internals as unknown as ElementInternals;
    };
    getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
  });

  afterAll(() => TestBed.resetTestingModule());

  it('runs as a component with a form control', async () => {
    @Component({
      standalone: true,
      imports: [AurebeshEditor as never, ReactiveFormsModule],
      template: `<aurebesh-angular [formControl]="control" placeholder="Built" />`,
    })
    class Host {
      control = new FormControl<string | null>('<p>linked</p>');
    }
    const fixture = TestBed.createComponent(Host);
    for (let i = 0; i < 40; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((r) => setTimeout(r, 5));
    }
    const el = fixture.nativeElement.querySelector('aurebesh-editor');
    expect(el).toBeTruthy();
    expect(el.getAttribute('placeholder')).toBe('Built');
    expect(el.value).toBe('<p>linked</p>');
    const content = el.querySelector('.aurebesh-content') as HTMLElement;
    content.innerHTML = '<p>typed</p>';
    content.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fixture.componentInstance.control.value).toBe('<p>typed</p>');
  });

  it('AurebeshField works without a form: [(value)]', async () => {
    @Component({
      standalone: true,
      imports: [AurebeshField as never],
      template: `<aurebesh-field [(value)]="html" [readonly]="locked()" placeholder="Field" />`,
    })
    class Host {
      html = '<p>field</p>';
      locked = signal(false);
    }
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);
    const el = fixture.nativeElement.querySelector('aurebesh-editor');
    expect(el.getAttribute('placeholder')).toBe('Field');
    expect(el.value).toBe('<p>field</p>');
    type(el, '<p>typed</p>');
    expect(fixture.componentInstance.html).toBe('<p>typed</p>');
    fixture.componentInstance.locked.set(true);
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(true);
  });

  it.skipIf(!signalForms)('AurebeshField works with signal forms: [formField]', async () => {
    const { FormField, form, required, maxLength, disabled, readonly } = signalForms!;
    @Component({
      standalone: true,
      imports: [AurebeshField as never, FormField],
      template: `<aurebesh-field [formField]="noteForm.body" placeholder="Signal" />`,
    })
    class Host {
      locked = signal(false);
      frozen = signal(false);
      model = signal({ body: '<p>start</p>' });
      noteForm = form(this.model, (note: any) => {
        required(note.body);
        maxLength(note.body, 500);
        disabled(note.body, () => this.locked());
        readonly(note.body, () => this.frozen());
      });
    }
    const fixture = TestBed.createComponent(Host);
    await settle(fixture);
    const host = fixture.componentInstance;
    const field = () => host.noteForm.body();
    const el = fixture.nativeElement.querySelector('aurebesh-editor');
    expect(el.value).toBe('<p>start</p>');
    expect(el.getAttribute('placeholder')).toBe('Signal');
    expect(el.hasAttribute('required')).toBe(true);
    expect(el.getAttribute('maxlength')).toBe('500');

    host.model.set({ body: '<p>from the form</p>' });
    await settle(fixture);
    expect(el.value).toBe('<p>from the form</p>');
    type(el, '<p>typed</p>');
    expect(host.model().body).toBe('<p>typed</p>');
    expect(field().dirty()).toBe(true);

    expect(field().touched()).toBe(false);
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await settle(fixture);
    expect(field().touched()).toBe(true);

    let focused = 0;
    el.instance.focus = () => focused++;
    field().focusBoundControl();
    expect(focused).toBe(1);

    host.locked.set(true);
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(true);
    host.locked.set(false);
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(false);
    host.frozen.set(true);
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(true);
  });
});

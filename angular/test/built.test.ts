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
import { Component } from '@angular/core';
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const built = resolve(process.cwd(), 'dist/angular/fesm2022/aurebesh-angular.mjs');
const linkedDir = resolve(process.cwd(), 'angular/.linked') + '/';

describe.skipIf(!existsSync(built))('aurebesh/angular as published', () => {
  let AurebeshEditor: unknown;

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
    AurebeshEditor = (await import(/* @vite-ignore */ pathToFileURL(out).href)).AurebeshEditor;

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
});

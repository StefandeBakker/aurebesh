// @vitest-environment jsdom
import '@angular/compiler';
import 'zone.js';
import 'zone.js/testing';
import { Component, PLATFORM_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AurebeshEditor } from '../src';
import type { AurebeshElement } from 'aurebesh/element';

beforeAll(async () => {
  // the element is loaded by the component when it is made (a dynamic import): load it here, so that the first test does not wait for a module that grows with the editor
  await import('aurebesh/element');
  // jsdom has the form association of custom elements only in part
  const attach = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
    const internals = (attach ? attach.call(this) : {}) as Record<string, unknown>;
    internals['setFormValue'] ??= () => {};
    internals['setValidity'] ??= () => {};
    return internals as unknown as ElementInternals;
  };
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
});
afterEach(() => TestBed.resetTestingModule());

/** The dynamic import of the element and the build of the editor are asynchronous: wait for them. */
async function settle<T>(fixture: ComponentFixture<T>): Promise<void> {
  fixture.detectChanges();
  for (let i = 0; i < 40; i++) {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 5));
    fixture.detectChanges();
  }
}

const element = (fixture: ComponentFixture<unknown>) => fixture.nativeElement.querySelector('aurebesh-editor') as AurebeshElement;
/** What the user does: types in the text. */
function type(el: AurebeshElement, html: string): void {
  const content = el.querySelector('.aurebesh-content') as HTMLElement;
  content.innerHTML = html;
  content.dispatchEvent(new Event('input', { bubbles: true }));
}

@Component({
  standalone: true,
  imports: [AurebeshEditor, ReactiveFormsModule],
  template: `<aurebesh-angular [formControl]="control" [placeholder]="placeholder" [toolbar]="toolbar" [counter]="true" (valueChange)="changes.push($event)" />`,
})
class ReactiveHost {
  control = new FormControl<string | null>('<p>start</p>');
  placeholder = 'Type here';
  toolbar: string[] | undefined = ['bold', 'italic'];
  changes: string[] = [];
}

@Component({
  standalone: true,
  imports: [AurebeshEditor, FormsModule],
  template: `<aurebesh-angular [(ngModel)]="html" name="body" />`,
})
class ModelHost {
  html = '<p>model</p>';
}

@Component({
  standalone: true,
  imports: [AurebeshEditor],
  template: `<aurebesh-angular [(value)]="html" [readOnly]="locked()" (ready)="ready = true" (count)="words = $event.words" (pageChange)="pages.push($event)" />`,
})
class PlainHost {
  html = '<p>plain text</p>';
  locked = signal(false);
  ready = false;
  words = -1;
  pages: unknown[] = [];
}

describe('aurebesh-angular', () => {
  it('builds the editor in the browser with the inputs as attributes, and no schema is needed in the application', async () => {
    const fixture = TestBed.createComponent(ReactiveHost);
    await settle(fixture);
    const el = element(fixture);
    expect(el).toBeTruthy();
    expect(el.getAttribute('placeholder')).toBe('Type here');
    expect(el.getAttribute('toolbar')).toBe('bold,italic');
    expect(el.hasAttribute('counter')).toBe(true);
    expect(el.querySelectorAll('.aurebesh-toolbar button')).toHaveLength(2);
    expect(el.value).toBe('<p>start</p>');
  });

  it('works with a reactive form control, both ways, and with disable()', async () => {
    const fixture = TestBed.createComponent(ReactiveHost);
    await settle(fixture);
    const host = fixture.componentInstance;
    const el = element(fixture);
    host.control.setValue('<p>from the form</p>');
    await settle(fixture);
    expect(el.value).toBe('<p>from the form</p>');

    type(el, '<p>typed</p>');
    expect(host.control.value).toBe('<p>typed</p>');
    expect(host.changes).toEqual(['<p>typed</p>']);

    host.control.disable();
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(true);
    host.control.enable();
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(false);
  });

  it('marks the control as touched when the focus leaves the editor', async () => {
    const fixture = TestBed.createComponent(ReactiveHost);
    await settle(fixture);
    expect(fixture.componentInstance.control.touched).toBe(false);
    element(fixture).dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(fixture.componentInstance.control.touched).toBe(true);
  });

  it('works with ngModel', async () => {
    const fixture = TestBed.createComponent(ModelHost);
    await settle(fixture);
    const el = element(fixture);
    expect(el.value).toBe('<p>model</p>');
    expect(el.getAttribute('name')).toBe('body');
    type(el, '<p>changed</p>');
    expect(fixture.componentInstance.html).toBe('<p>changed</p>');
  });

  it('works without forms: [(value)], the read-only input, and the outputs', async () => {
    const fixture = TestBed.createComponent(PlainHost);
    await settle(fixture);
    const host = fixture.componentInstance;
    const el = element(fixture);
    expect(el.value).toBe('<p>plain text</p>');
    expect(host.ready).toBe(true);
    expect(host.words).toBe(2);

    type(el, '<p>one two three</p>');
    expect(host.html).toBe('<p>one two three</p>');
    expect(host.words).toBe(3);

    host.locked.set(true);
    await settle(fixture);
    expect(el.hasAttribute('readonly')).toBe(true);

    el.instance!.setPage('a4');
    expect(host.pages).toHaveLength(1);
  });

  it('keeps the text when the toolbar changes (the editor is built again), and follows other inputs without that', async () => {
    const fixture = TestBed.createComponent(ReactiveHost);
    await settle(fixture);
    const host = fixture.componentInstance;
    type(element(fixture), '<p>keep me</p>');

    host.placeholder = 'Other';
    fixture.changeDetectorRef.markForCheck();
    await settle(fixture);
    expect(element(fixture).getAttribute('placeholder')).toBe('Other');

    host.toolbar = ['bold', 'italic', 'underline'];
    await settle(fixture);
    const rebuilt = element(fixture);
    expect(rebuilt.querySelectorAll('.aurebesh-toolbar button')).toHaveLength(3);
    expect(rebuilt.value).toBe('<p>keep me</p>');
    expect(fixture.nativeElement.querySelectorAll('aurebesh-editor')).toHaveLength(1);
  });

  it('removes the editor when the component is destroyed', async () => {
    const fixture = TestBed.createComponent(ModelHost);
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelector('aurebesh-editor')).toBeTruthy();
    fixture.destroy();
    expect(document.querySelector('aurebesh-editor')).toBeNull();
  });

  it('does nothing on the server: no element, no error', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: 'server' }] });
    const fixture = TestBed.createComponent(ModelHost);
    await settle(fixture);
    expect(element(fixture)).toBeNull();
  });
});

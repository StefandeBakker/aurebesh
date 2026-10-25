/**
 * `aurebesh/element`: registers `<aurebesh-editor>` as soon as it is imported (that is its whole purpose, and the only module of the
 * package that does something when it is loaded: see `sideEffects` in package.json). The element itself is in element-class.ts, so
 * that the wrappers (React, Vue) can use it without registering it at import.
 */
import { defineAurebeshElement } from './element-class';

export * from './element-class';

defineAurebeshElement();

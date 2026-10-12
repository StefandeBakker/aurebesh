/**
 * The ticket mode is an add-on: `import 'aurebesh/ticket'` once, and the `ticket` option works. It registers itself here, under a
 * key on `globalThis`, so every copy of the editor sees it (the CommonJS build has a copy of this code in each entry file).
 */
import type { TicketController } from './controller';
import type { TicketOptions } from './engine';

export type TicketClass = new (
  options: TicketOptions,
  t: (key: string, vars?: Record<string, string>) => string,
  titleOf: (command: string) => string,
) => TicketController;

const KEY = Symbol.for('aurebesh.ticket');

export function registerTicket(cls: TicketClass): void {
  (globalThis as unknown as Record<symbol, TicketClass>)[KEY] = cls;
}

export function getTicketClass(): TicketClass | null {
  return (globalThis as unknown as Record<symbol, TicketClass | undefined>)[KEY] ?? null;
}

/** The toolbar items that belong to the ticket mode, and the ones of the normal editor that it takes over. */
export const TICKET_ITEMS = ['ticketTag', 'ticketCmd', 'ticketSize', 'ticketCondition', 'alignLeft', 'alignCenter', 'alignRight', 'undo', 'redo'];
export const TICKET_TOOLBAR = ['ticketTag', 'ticketCmd', '|', 'ticketSize', 'alignLeft', 'alignCenter', 'alignRight', '|', 'ticketCondition', '|', 'undo', 'redo'];

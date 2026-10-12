/**
 * Ticket mode add-on: `import 'aurebesh/ticket'` once, then give the editor a `ticket` option. Also the template tools
 * on their own (reading, writing and previewing a template), which need no browser.
 */
import { TicketController } from './ticket/controller';
import { registerTicket } from './ticket/registry';

registerTicket(TicketController);

export {
  DEFAULT_TICKET_COMMANDS,
  DEFAULT_TICKET_SIZES,
  dataLookup,
  exportTemplate,
  formatValue,
  groupConditions,
  interpret as interpretTemplate,
  lineColumns,
  parseTemplate,
  previewText,
  previewTicket,
  resolveTicket,
  usedFields,
  validateModel as validateTemplate,
} from './ticket/engine';
export type {
  Align,
  CondGroup,
  Item as TemplateItem,
  Line as TemplateLine,
  OutLine,
  PreviewContext,
  Problem as TemplateProblem,
  ResolvedTicket,
  TicketCommand,
  TicketData,
  TicketKeyword,
  TicketOptions,
  TicketPart,
  TicketSize,
} from './ticket/engine';

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildModel,
  condKey,
  dataLookup,
  exportTemplate,
  fieldText,
  formatValue,
  formatWidth,
  groupConditions,
  interpret,
  isPlainValue,
  lex,
  insertItems,
  lineColumns,
  lineUnits,
  parseTemplate,
  previewText,
  previewTicket,
  resolveTicket,
  setSizeBetween,
  sizeAt,
  splitItems,
  toCode,
  usedFields,
  validateModel,
} from '../src/ticket/engine';
import type { TicketData } from '../src/ticket/engine';

const R = resolveTicket({
  keywords: [
    { name: 'Order.Total', sample: '12.50' },
    { name: 'Order.Number', sample: '4711' },
    { name: 'Shop.Name', sample: 'Cafe Sample' },
    { name: 'Now', sample: '2026-10-11T14:05:00' },
  ],
});

const tokens = (code: string) => lex(code, R);
const model = (code: string) => parseTemplate(code, R);
const roundTrip = (code: string) => exportTemplate(model(code), R);
const ctx = (values: Record<string, string> = {}, flags: Record<string, boolean> = {}) => ({ values, flags });
const run = (code: string, c = ctx()) => interpret(tokens(code), c, R);

describe('reading a template', () => {
  it('splits text, fields with formats, commands, sizes, alignment and conditions', () => {
    expect(tokens('Total [*Order.Total,"%8s"*]')).toEqual([
      { k: 'text', text: 'Total ' },
      { k: 'field', name: 'Order.Total', fmt: '%8s' },
    ]);
    expect(tokens('[*groot*][*center*][*euro*][*include "Footer.txt"*][*cutbon*]')).toEqual([
      { k: 'size', name: 'groot' },
      { k: 'align', name: 'center' },
      { k: 'cmd', name: 'euro' },
      { k: 'cmd', name: 'include', arg: 'Footer.txt' },
      { k: 'cmd', name: 'cutbon' },
    ]);
  });

  it('accepts any case, spaces around the comma and trailing spaces, like real templates have', () => {
    expect(tokens('[*ifNot Order.Total, "0" *][*Order.Number, "%-18s"*][*EndIf*]')).toEqual([
      { k: 'if', field: 'Order.Total', value: '0', not: true },
      { k: 'field', name: 'Order.Number', fmt: '%-18s' },
      { k: 'endif' },
    ]);
    expect(tokens('[*GROOT*][*Center*]')).toEqual([
      { k: 'size', name: 'groot' },
      { k: 'align', name: 'center' },
    ]);
  });

  it('reads a condition without a value, values with commas and special characters, and fields with dots and digits', () => {
    expect(tokens('[*If Item.New*][*if Order.Number,"{9000"*][*if X.Pct,"0,0"*][*if Order.Total,"-?"*][*Vat.Amount.10*]')).toEqual([
      { k: 'if', field: 'Item.New', not: false },
      { k: 'if', field: 'Order.Number', value: '{9000', not: false },
      { k: 'if', field: 'X.Pct', value: '0,0', not: false },
      { k: 'if', field: 'Order.Total', value: '-?', not: false },
      { k: 'field', name: 'Vat.Amount.10' },
    ]);
  });

  it('keeps a tag it does not understand as plain text, so nothing is lost', () => {
    const t = tokens('a [* weird tag with spaces *] b');
    expect(toCode(t, R)).toBe('a [* weird tag with spaces *] b');
  });

  it('keeps line breaks, tabs and spaces exactly', () => {
    expect(toCode(tokens('a  b\t c\n\n  d \n'), R)).toBe('a  b\t c\n\n  d \n');
    expect(toCode(tokens('a\r\nb'), { ...R, eol: '\r\n' })).toBe('a\r\nb');
  });
});

describe('the model', () => {
  it('gives every character the size it is printed in', () => {
    const [line] = model('a[*groot*]b[*extragroot*]c[*normaal*]d');
    expect(line.items).toEqual([
      { t: 'text', text: 'a', size: 'normaal' },
      { t: 'text', text: 'b', size: 'groot' },
      { t: 'text', text: 'c', size: 'extragroot' },
      { t: 'text', text: 'd', size: 'normaal' },
    ]);
  });

  it('keeps a size on the next line, until another one comes', () => {
    const lines = model('[*groot*]one\ntwo\n[*normaal*]three');
    expect(lines.map((l) => (l.items[0] as { size: string }).size)).toEqual(['groot', 'groot', 'normaal']);
  });

  it('applies an alignment before the first printed character to that line, and later in the line to the next one', () => {
    const lines = model('[*center*]one\ntwo[*right*]\nthree\n[*left*]four');
    expect(lines.map((l) => l.align)).toEqual(['center', 'center', 'right', 'left']);
    // a command between the condition and the text still comes "before" it: nothing was printed yet
    expect(model('[*If A,"1"*][*center*]x[*Endif*]')[0].align).toBe('center');
    expect(model('x[*center*]y')[0].align).toBe('left');
    expect(model('x[*center*]y\nz')[1].align).toBe('center');
  });

  it('counts a field as printed text, but a logo, a cut or a line break as not', () => {
    expect(model('[*logo1*][*center*]x')[0].align).toBe('center');
    expect(model('[*Order.Total*][*center*]x')[0].align).toBe('left');
    expect(model('[*euro*][*center*]x')[0].align).toBe('left');
  });

  it('puts the condition markers in the line where they stand, also across lines', () => {
    const lines = model('a[*If A,"1"*]b\nc[*Endif*]d');
    expect(lines[0].items.map((i) => i.t)).toEqual(['text', 'if', 'text']);
    expect(lines[1].items.map((i) => i.t)).toEqual(['text', 'endif', 'text']);
  });

  it('starts with one empty line for empty code, and ends with an empty line after a final line break', () => {
    expect(model('')).toEqual([{ align: 'left', items: [] }]);
    expect(model('a\n')).toHaveLength(2);
  });
});

describe('writing a template', () => {
  it('writes plain text without any command', () => {
    expect(roundTrip('Hello\nWorld')).toBe('Hello\nWorld');
  });

  it('writes a size or alignment command only where the state changes', () => {
    expect(roundTrip('[*groot*]one\ntwo\n[*normaal*]three')).toBe('[*groot*]one\ntwo\n[*normaal*]three');
    expect(roundTrip('[*center*]a\nb\n[*left*]c')).toBe('[*center*]a\nb\n[*left*]c');
    expect(roundTrip('a[*groot*]b[*normaal*]c')).toBe('a[*groot*]b[*normaal*]c');
  });

  it('writes the alignment command after a leading condition, so it only runs when the condition does', () => {
    expect(roundTrip('[*ifnot P,"26"*][*center*]x[*Endif*]')).toBe('[*Ifnot P,"26"*][*center*]x[*Endif*]');
  });

  it('states size and alignment again after a condition that contains such a command, since it may not have run', () => {
    // what the layout shows (everything on) is written down for the text after the condition, so it does not depend on the condition
    expect(roundTrip('[*If A,"1"*][*groot*]x[*Endif*]\ny')).toBe('[*If A,"1"*][*groot*]x[*Endif*]\n[*groot*]y');
    expect(roundTrip('[*If A,"1"*][*center*]x[*Endif*]\ny')).toBe('[*If A,"1"*][*center*]x[*Endif*]\n[*center*]y');
    // nested: the outer one changed too
    expect(roundTrip('[*If A,"1"*][*If B,"1"*][*groot*]x[*Endif*][*Endif*]y')).toContain('[*Endif*][*Endif*][*groot*]y');
    // only the state that changed inside is repeated
    expect(roundTrip('[*If A,"1"*][*groot*]x[*Endif*]\ny')).not.toContain('[*left*]');
  });

  it('does not repeat itself after a condition that changes nothing', () => {
    expect(roundTrip('[*groot*]a[*If A,"1"*]b[*Endif*]c')).toBe('[*groot*]a[*If A,"1"*]b[*Endif*]c');
  });

  it('writes conditions in one form, whatever case they were written in', () => {
    expect(roundTrip('[*iF a.b,"1"*]x[*ENDIF*][*ifNOT c,"2"*]y[*endif*][*if d*]z[*endif*]')).toBe('[*If a.b,"1"*]x[*Endif*][*Ifnot c,"2"*]y[*Endif*][*If d*]z[*Endif*]');
  });

  it('gives the same model back after writing and reading again, for every kind of construct', () => {
    const codes = [
      '[*ifnot P,"26"*][*logo1*][*extragroot*][*center*][*include "H.txt"*][*normaal*]\n[*groot*]A[*If T,"1"*]B[*extragroot*]C[*Endif*]D\nE[*Endif*]\n',
      '  indent\t[*Order.Total,"%8s"*]  x[*euro*]\n\n[*right*]end[*left*]\n[*cutbon*]\n',
      '[*If A,"1"*][*If B,"2"*][*center*]deep[*Endif*]still[*Endif*]\nnext\n[*groot*]big\n[*normaal*]\n',
    ];
    for (const code of codes) {
      const m = model(code);
      expect(model(exportTemplate(m, R)), code).toEqual(m);
    }
  });
});

describe('conditions', () => {
  it('knows which values are plain comparisons', () => {
    for (const v of ['1', '26', 'True', '0,0', '100,0', 'GiftTicket', 'a b']) expect(isPlainValue(v), v).toBe(true);
    for (const v of ['{9000', '}9000', '-?', '', undefined]) expect(isPlainValue(v), String(v)).toBe(false);
  });

  it('groups them by field for the options, with the values found and the switches that are not comparisons', () => {
    const g = groupConditions(tokens('[*If A.T,"1"*][*If a.t,"2"*][*ifnot A.T,"1"*][*if A.N,"{9"*][*if A.N,"{9"*][*if B*][*if C,"x"*]'));
    expect(g.map((x) => x.field)).toEqual(['A.T', 'A.N', 'B', 'C']);
    expect(g[0].values).toEqual(['1', '2']);
    expect(g[1].flags).toEqual([{ key: condKey('A.N', '{9'), value: '{9' }]);
    expect(g[2].flags).toHaveLength(1);
    expect(g[3].values).toEqual(['x']);
  });

  it('finds an Endif without If, and an If without Endif', () => {
    expect(validateModel(model('[*If A,"1"*]x[*Endif*][*Endif*]')).map((p) => p.kind)).toEqual(['extraEndif']);
    const open = validateModel(model('a\n[*If A,"1"*][*If B,"2"*]x[*Endif*]'));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ kind: 'unclosed', field: 'A', line: 1 });
    expect(validateModel(model('[*If A*]x[*Endif*]'))).toEqual([]);
  });
});

describe('formats', () => {
  it('pads to a width, to the right or left, and puts text around the value', () => {
    expect(formatValue('ab', '%s')).toBe('ab');
    expect(formatValue('ab', '%6s')).toBe('    ab');
    expect(formatValue('ab', '%-6s')).toBe('ab    ');
    expect(formatValue('2.5', '$$%6s')).toBe('$$   2.5');
    expect(formatValue('5', '-%5s')).toBe('-    5');
    expect(formatValue('abcdefgh', '%3s')).toBe('abcdefgh');
    expect(formatValue('x', undefined)).toBe('x');
    expect(formatValue('x', '100%% %s')).toBe('100% x');
  });
  it('formats dates', () => {
    expect(formatValue('2026-10-11T14:05:00', '%D-%M-%Y | %h:%m')).toBe('11-10-2026 | 14:05');
    expect(formatValue('not a date', '%D-%M-%Y')).toBe('not a date');
  });
});

describe('the preview', () => {
  it('prints only what the chosen values allow, also across lines and nested', () => {
    const code = 'A[*If T,"1"*]B\nC[*If U,"x"*]D[*Endif*]E[*Endif*]F';
    expect(previewText(run(code, ctx({ t: '1', u: 'x' })), R)).toBe('AB\nCDEF');
    expect(previewText(run(code, ctx({ t: '1', u: 'y' })), R)).toBe('AB\nCEF');
    expect(previewText(run(code, ctx({ t: '2' })), R)).toBe('AF');
    expect(previewText(run(code), R)).toBe('AF');
  });

  it('turns If and Ifnot around, and uses switches for conditions that are not plain', () => {
    expect(previewText(run('[*Ifnot T,"1"*]no[*Endif*][*If T,"1"*]yes[*Endif*]', ctx({ t: '1' })), R)).toBe('yes');
    expect(previewText(run('[*Ifnot T,"1"*]no[*Endif*][*If T,"1"*]yes[*Endif*]'), R)).toBe('no');
    const flag = { [condKey('A', '{9000')]: true };
    expect(previewText(run('[*if A,"{9000"*]hi[*endif*]', ctx({}, flag)), R)).toBe('hi');
    expect(previewText(run('[*if A,"{9000"*]hi[*endif*]'), R)).toBe('');
  });

  it('puts the samples in the fields, with their format, or the names when asked', () => {
    expect(previewText(run('Total [*Order.Total,"%8s"*]!'), R)).toBe('Total    12.50!');
    expect(previewText(run('[*Unknown.Field*]'), R)).toBe('Unknown.Field');
    expect(previewText(interpret(tokens('[*Order.Total*]'), { ...ctx(), useNames: true }, R), R)).toBe('Order.Total');
    expect(previewText(run('[*Now,"%D-%M-%Y %h:%m"*]'), R)).toBe('11-10-2026 14:05');
  });

  it('counts printer columns: a large size takes more room', () => {
    const lines = run('ab[*extragroot*]cd[*groot*]ef');
    expect(lineColumns(lines[0], R)).toBe(2 + 4 + 2);
    const mixed = run('TABLE                  [*extragroot*]  123');
    expect(lineColumns(mixed[0], R)).toBe(23 + 10);
  });

  it('applies alignment in the width of the paper, and breaks and cuts', () => {
    const out = previewText(run('[*center*]mid\n[*right*]end\n[*left*]a[*crlf*]b\n[*cutbon*]'), R);
    const lines = out.split('\n');
    expect(lines[0]).toBe(' '.repeat(19) + 'mid');
    expect(lines[1]).toBe(' '.repeat(41 - 3) + 'end');
    expect(lines.slice(2, 4)).toEqual(['a', 'b']);
    expect(lines[4]).toContain('✂');
  });

  it('shows includes and unknown commands visibly', () => {
    expect(previewText(run('[*include "Foot.txt"*]'), R)).toBe('‹Foot.txt›');
    expect(previewText(run('[*euro*] 5'), R)).toBe('€ 5');
  });
});

describe('configuration', () => {
  it('can use other words and sizes', () => {
    const r = resolveTicket({ columns: 32, sizes: [{ name: 'Small', width: 1, height: 1 }, { name: 'Big', width: 2, height: 2 }], align: { center: 'mid' }, commands: [{ name: 'cut', kind: 'cut' }] });
    expect(toCode(lex('[*big*]x[*MID*]y[*cut*]', r), r)).toBe('[*Big*]x[*mid*]y[*cut*]');
    expect(r.columns).toBe(32);
    expect(r.defaultSize).toBe('Small');
  });
  it('refuses names and numbers that could end up in markup or CSS', () => {
    expect(() => resolveTicket({ sizes: [{ name: 'a"b', width: 1, height: 1 }] })).toThrow(/size name/);
    expect(() => resolveTicket({ keywords: [{ name: 'x y' }] })).toThrow(/keyword/);
    expect(() => resolveTicket({ commands: [{ name: '</style>' }] })).toThrow(/command name/);
    expect(() => resolveTicket({ columns: 5 })).toThrow(/columns/);
    expect(() => resolveTicket({ sizes: [{ name: 'a', width: 0, height: 1 }] })).toThrow(/width and height/);
    expect(() => resolveTicket({ sizes: [] })).toThrow(/at least one size/);
  });
});

describe('field text in the layout', () => {
  it('cuts a name to the width its format reserves, so the columns stay where they will be on paper', () => {
    expect(formatWidth('%8s')).toBe(8);
    expect(formatWidth('%-18s')).toBe(18);
    expect(formatWidth('$%6s')).toBe(6);
    expect(formatWidth('%s')).toBe(0);
    expect(formatWidth(undefined)).toBe(0);
    expect(fieldText('Unknown.Total', '%8s', R)).toBe('Unknown…');
    expect(fieldText('Unknown.Total', '%-14s', R)).toBe('Unknown.Total ');
    expect(fieldText('Unknown.Total', '%s', R)).toBe('Unknown.Total'); // no width: the whole name
    expect(fieldText('Ab', '%8s', R)).toBe('      Ab');
    expect(fieldText('Total', '%1s', R)).toBe('Total'); // a width of 1 has no room for the dot
    expect(fieldText('Order.Total', '%8s', R, true)).toBe('Order.T…'); // also when names are asked for
    expect(fieldText('Shop.Name', '%6s', R)).toBe('Cafe Sample'); // a sample is a value: never cut
  });

  it('starts every field of a condition where the first condition on it is true', () => {
    const g = groupConditions(tokens('[*ifnot P,"26"*]a[*endif*][*if P,"26"*]b[*endif*][*If T,"1"*]c[*Endif*][*Ifnot T,"1"*]d[*Endif*]'));
    expect(g[0].first).toEqual({ value: '26', not: true });
    expect(g[1].first).toEqual({ value: '1', not: false });
  });
});

describe('items by position', () => {
  const items = (code: string) => model(code)[0].items;
  it('counts a character as one position, and a field, a command or a marker as one', () => {
    expect(lineUnits(items('ab[*Order.Total*][*euro*][*If A,"1"*]c[*Endif*]'))).toBe(2 + 1 + 1 + 1 + 1 + 1);
  });
  it('cuts a line in two inside text, and between items', () => {
    const [l, r] = splitItems(items('abcd[*Order.Total*]ef'), 2);
    expect(l).toEqual([{ t: 'text', text: 'ab', size: 'normaal' }]);
    expect(r.map((i) => i.t)).toEqual(['text', 'field', 'text']);
    const [l2, r2] = splitItems(items('ab[*Order.Total*]cd'), 3);
    expect(l2.map((i) => i.t)).toEqual(['text', 'field']);
    expect(r2.map((i) => i.t)).toEqual(['text']);
    expect(splitItems(items('ab'), 0)[0]).toEqual([]);
    expect(splitItems(items('ab'), 99)[1]).toEqual([]);
  });
  it('puts items in at a position and joins the text around them', () => {
    const out = insertItems(items('abcd'), 2, [{ t: 'field', name: 'X.Y', size: 'normaal' }]);
    expect(exportTemplate([{ align: 'left', items: out }], R)).toBe('ab[*X.Y*]cd');
    expect(insertItems(items('ab'), 1, [{ t: 'text', text: 'ZZ', size: 'normaal' }])).toEqual([{ t: 'text', text: 'aZZb', size: 'normaal' }]);
  });
  it('gives a stretch a size, splitting text where needed and leaving markers alone', () => {
    const out = setSizeBetween(items('one two three'), 4, 7, 'groot');
    expect(exportTemplate([{ align: 'left', items: out }], R)).toBe('one [*groot*]two[*normaal*] three');
    const withMarker = setSizeBetween(items('a[*If A,"1"*]b[*Endif*]c'), 0, 5, 'extragroot');
    expect(withMarker.filter((i) => i.t === 'if' || i.t === 'endif')).toHaveLength(2);
    expect(withMarker.filter((i) => i.t === 'text').every((i) => (i as { size: string }).size === 'extragroot')).toBe(true);
  });
  it('says what size typing gets at a position: that of the character before it', () => {
    const it = items('a[*groot*]bc[*normaal*]d');
    expect(sizeAt(it, 0, R)).toBe('normaal'); // the start of the line: the first character
    expect(sizeAt(it, 1, R)).toBe('normaal'); // after "a"
    expect(sizeAt(it, 2, R)).toBe('groot'); // after "b"
    expect(sizeAt(it, 3, R)).toBe('groot'); // after "c"
    expect(sizeAt(it, 4, R)).toBe('normaal'); // after "d"
    expect(sizeAt([], 0, R)).toBe('normaal');
    expect(sizeAt(items('[*groot*]x'), 0, R)).toBe('groot');
  });
});

describe('the whole ticket from parts and test data', () => {
  const data: TicketData = {
    values: { 'Shop.Name': 'Cafe Test', 'Order.Type': '1', 'Order.Total': '9.00' },
    lists: {
      items: [
        { 'Item.Name': 'Coffee', 'Item.Price': '2.50' },
        { 'Item.Name': 'Cake', 'Item.Price': '4.00', 'Shop.Name': 'row wins' },
      ],
      payments: [{ 'Pay.Kind': 'CASH', 'Pay.Amount': '10.00' }],
    },
  };
  const parts = [
    { name: 'header', code: '[*center*]{[*Shop.Name*]}\n[*left*][*If Order.Type,"1"*]eat in[*Endif*][*If Order.Type,"2"*]take away[*Endif*]\n' },
    { name: 'lines', code: '[*Item.Name,"%-6s"*][*Item.Price,"%6s"*] [*Shop.Name*]\n', repeat: 'items' },
    { name: 'pay', code: '[*Pay.Kind,"%-6s"*][*Pay.Amount,"%6s"*]\n', repeat: 'payments' },
    { name: 'footer', code: 'Total [*Order.Total,"%6s"*]\n[*cutbon*]' },
  ];
  const text = (d: TicketData = data, flags = {}) => previewText(previewTicket(parts, d, flags, R), R);

  it('puts the parts one after the other, and a repeating part once for every row of its list', () => {
    const lines = text().split('\n');
    expect(lines[0].trim()).toBe('{Cafe Test}'); // centred
    expect(lines.slice(1)).toEqual(['eat in', 'Coffee  2.50 Cafe Test', 'Cake    4.00 row wins', 'CASH   10.00', 'Total   9.00', expect.stringContaining('✂')]);
  });

  it('takes a plain condition from the data, and a row comes before the values of the whole ticket', () => {
    expect(text({ ...data, values: { ...data.values, 'Order.Type': '2' } })).toContain('take away');
    expect(text({ ...data, values: { ...data.values, 'Order.Type': '2' } })).not.toContain('eat in');
    expect(text()).toContain('row wins');
  });

  it('prints a part with an empty list not at all, and a missing value as the field name', () => {
    expect(text({ ...data, lists: { items: [], payments: [] } })).not.toContain('Coffee');
    const bare = resolveTicket();
    expect(previewText(previewTicket(parts, { values: {}, lists: {} }, {}, bare), bare)).toContain('Total Order…'); // no data and no sample: the name, cut to the 6 columns of the format
  });

  it('looks field names up without regard to case', () => {
    expect(dataLookup({ values: { 'SHOP.NAME': 'x' } })('shop.name')).toBe('x');
    expect(dataLookup({ values: { a: '1' } }, { A: '2' })('a')).toBe('2');
    expect(dataLookup(undefined)('a')).toBeUndefined();
  });

  it('carries the size and alignment on from one part to the next, like a printer does', () => {
    const lines = previewTicket([{ name: 'a', code: '[*center*][*groot*]one\n' }, { name: 'b', code: 'two\n' }], {}, {}, R);
    expect(lines[1].align).toBe('center');
    expect(lines[1].runs[0].size).toBe('groot');
  });

  it('does not let a condition left open in one part reach the next', () => {
    const out = previewText(previewTicket([{ name: 'a', code: '[*If X,"1"*]hidden' }, { name: 'b', code: 'shown' }], {}, {}, R), R);
    expect(out).toBe('shown');
  });

  it('carries on a line that is not finished at the end of a part', () => {
    expect(previewText(previewTicket([{ name: 'a', code: 'one ' }, { name: 'b', code: 'two' }], {}, {}, R), R)).toBe('one two');
  });

  it('uses a switch for conditions that are not a plain comparison', () => {
    const p = [{ name: 'a', code: '[*if Order.Number,"{9000"*]small[*endif*]' }];
    expect(previewText(previewTicket(p, {}, {}, R), R)).toBe('');
    expect(previewText(previewTicket(p, {}, { [condKey('Order.Number', '{9000')]: true }, R), R)).toBe('small');
  });

  it('lists the fields a template uses, also those only in a condition', () => {
    expect(usedFields(tokens('[*If A.B,"1"*][*C.D*][*a.b*][*Endif*][*C.D,"%8s"*][*E*]'))).toEqual(['A.B', 'C.D', 'E']);
  });

  it('lets a chosen value for a field win over the data, also "other", which is an empty one', () => {
    const t = tokens('[*If Order.Type,"1"*]one[*Endif*][*Ifnot Order.Type,"1"*]other[*Endif*]');
    const base = { values: {}, flags: {}, data: dataLookup(data) };
    expect(previewText(interpret(t, base, R), R)).toBe('one'); // from the data
    expect(previewText(interpret(t, { ...base, values: { 'order.type': '' } }, R), R)).toBe('other');
  });
});

describe('a logo and the data in the layout', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgo=';
  it('shows the picture of a logo command in the preview', () => {
    const r = resolveTicket({ commands: [{ name: 'logo1', kind: 'logo', image: PNG }, { name: 'logo2', kind: 'logo' }] });
    const out = interpret(lex('[*logo1*]\n[*logo2*]', r), { values: {}, flags: {} }, r);
    expect(out[0].runs[0]).toMatchObject({ kind: 'logo', image: PNG });
    expect(out[1].runs[0].image).toBeUndefined();
    expect(previewText(out, r)).toContain('logo1');
  });

  it('refuses a logo picture that is not a safe address', () => {
    expect(() => resolveTicket({ commands: [{ name: 'logo1', kind: 'logo', image: 'javascript:alert(1)' }] })).toThrow(/safe address/);
    expect(() => resolveTicket({ commands: [{ name: 'logo1', kind: 'logo', image: 'https://example.com/l.png' }] })).not.toThrow();
  });

  it('knows the paper in dots, for the size of a logo', () => {
    expect(resolveTicket().dots).toBe(576);
    expect(resolveTicket({ dots: 384 }).dots).toBe(384);
    expect(() => resolveTicket({ dots: 5 })).toThrow(/dots/);
  });

  it('uses the data before the sample for the text of a field', () => {
    expect(fieldText('Order.Total', '%8s', R, false, (n) => (n === 'Order.Total' ? '99.00' : undefined))).toBe('   99.00');
    expect(fieldText('Order.Total', '%8s', R, true, () => '99.00')).toBe('Order.T…'); // names asked for: no values at all
    expect(fieldText('Order.Total', '%8s', R, false, () => undefined)).toBe('   12.50'); // not in the data: the sample
  });
});

describe('a logo and alignment', () => {
  it('a line with only a logo keeps the alignment it was given, in the model and in the code', () => {
    expect(model('[*center*][*logo1*]\nx')[0].align).toBe('center');
    expect(roundTrip('[*center*][*logo1*]\nx')).toBe('[*center*][*logo1*]\nx'); // x goes on being centred
    expect(roundTrip('[*center*][*logo1*]\n[*left*]x')).toBe('[*center*][*logo1*]\n[*left*]x');
  });

  it('keeps the order when there is text after the logo: the alignment is written before the first printed text, not before the logo', () => {
    expect(roundTrip('[*logo1*][*center*]x')).toBe('[*logo1*][*center*]x');
  });

  it('in the preview a logo does not stop the alignment from being for its line', () => {
    const out = (code: string) => interpret(tokens(code), ctx(), R);
    expect(out('[*center*][*logo1*]')[0].align).toBe('center');
    expect(out('[*logo1*][*center*]hello')[0].align).toBe('center');
    expect(out('x[*center*]y\nz')[0].align).toBe('left'); // after text it is for the next line, as before
  });
});

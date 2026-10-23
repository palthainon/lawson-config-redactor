import {mapAddresses} from './addresses';
import {AddressMode, Flag, Replacement, Result, Scan, Span} from './types';
function lineIndex(text: string): number[] {return [0, ...[...text.matchAll(/\r\n|\r|\n/g)].map(match => match.index! + match[0].length)];}
function lineAt(offset: number, starts: number[]): number {let low = 0, high = starts.length; while (low < high) {const mid = (low + high) >>> 1; if (starts[mid] <= offset) low = mid + 1; else high = mid;} return low;}
export function manualSpans(source: string, selections: {start: number; end: number}[]): Span[] {
  const spans: Span[] = [];
  for (const selection of selections) {
    if (!Number.isInteger(selection.start) || !Number.isInteger(selection.end) || selection.start < 0 || selection.end > source.length || selection.end <= selection.start) throw new Error('Select nonempty text in the current source document.');
    const value = source.slice(selection.start, selection.end); let pos = 0;
    while ((pos = source.indexOf(value, pos)) >= 0) {spans.push({start: pos, end: pos + value.length, category: 'MANUAL', rule: 'Engineer selection', priority: 200}); pos += value.length;}
  }
  return spans;
}
export function replace(source: string, scan: Scan, manual: Span[] = [], options?: {addressMode: AddressMode; key: Buffer}): Result {
  // Split at boundaries so a partial manual selection never exposes the rest of a secret.
  const candidates = [...scan.spans, ...manual].filter(x => x.start >= 0 && x.end <= source.length && x.end > x.start);
  const events = new Map<number, {add: number[]; remove: number[]}>();
  const event = (position: number) => {if (!events.has(position)) events.set(position, {add: [], remove: []}); return events.get(position)!;};
  candidates.forEach((span, index) => {event(span.start).add.push(index); event(span.end).remove.push(index);});
  const points = [...events.keys()].sort((a, b) => a - b), active = new Set<number>(), selected: Span[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const point = points[i], changes = events.get(point)!; changes.remove.forEach(index => active.delete(index)); changes.add.forEach(index => active.add(index));
    let winner = -1; for (const index of active) if (winner < 0 || candidates[index].priority > candidates[winner].priority || (candidates[index].priority === candidates[winner].priority && candidates[index].end - candidates[index].start > candidates[winner].end - candidates[winner].start)) winner = index;
    if (winner >= 0) {
      const span = {...candidates[winner], start: point, end: points[i + 1]}, previous = selected.at(-1);
      if (previous && previous.end === span.start && previous.category === span.category && previous.rule === span.rule) previous.end = span.end; else selected.push(span);
    }
  }
  const labels = new Map<string, string>(), counters = new Map<string, number>(), starts = lineIndex(source);
  const reserved = new Set([...source.matchAll(/<[A-Z]+_\d+>/g)].map(match => match[0]));
  const mapped = options?.addressMode === 'addresses' ? mapAddresses(source,selected,options.key) : undefined;
  const mappingFlags: Flag[] = [];
  const replacements: Replacement[] = selected.map(span => {
    const original = source.slice(span.start, span.end), key = span.category + '\0' + original;
    let label = labels.get(key);
    if (!label) {let next = counters.get(span.category) || 0; do {label = `<${span.category}_${String(++next).padStart(3, '0')}>`;} while (reserved.has(label)); counters.set(span.category, next); labels.set(key, label);}
    if (span.category === 'IP' && mapped) {const address=mapped.get(span.start); if(address) label=address; else mappingFlags.push({start:span.start,end:span.end,rule:'Cannot replace this address while preserving its network class and subnet. Use labels or mask this address.'});}
    return {...span, label, line: lineAt(span.start, starts)};
  });
  let output = '', cursor = 0;
  for (const replacement of replacements) {
    const original = source.slice(replacement.start, replacement.end);
    // One label per nonempty line preserves line count, indentation, and exact newline style.
    const masked = original.split(/(\r\n|\r|\n)/).map(part => /^(?:\r\n|\r|\n)$/.test(part) ? part : part.trim() ? (part.match(/^\s*/)?.[0] || '') + replacement.label : part).join('');
    output += source.slice(cursor, replacement.start) + masked; cursor = replacement.end;
  }
  output += source.slice(cursor);
  const covered = (flag: Flag) => {let cursor = flag.start; for (const span of [...manual].sort((a,b) => a.start-b.start)) {if (span.start <= cursor && span.end > cursor) cursor = span.end; if (cursor >= flag.end) return true;} return false;};
  return {output, replacements, flags: [...scan.flags,...mappingFlags].filter(flag => !covered(flag)).map(flag => ({...flag, line: lineAt(flag.start, starts)}))};
}

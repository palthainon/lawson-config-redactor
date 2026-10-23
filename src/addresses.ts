import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {Span} from './types';

export function parseAddress(text: string): {value: bigint; bits: number} {
  const family = isIP(text);
  if (family === 4) return {value: text.split('.').reduce((n, octet) => (n << 8n) | BigInt(octet), 0n), bits: 32};
  if (family !== 6 || text.includes('%')) throw new Error('Unsupported address form');
  let expanded = text;
  if (text.includes('.')) {const index = text.lastIndexOf(':'); const v4 = parseAddress(text.slice(index + 1)).value; expanded = text.slice(0, index + 1) + (v4 >> 16n).toString(16) + ':' + (v4 & 65535n).toString(16);}
  const halves = expanded.split('::'), left = halves[0] ? halves[0].split(':') : [], right = halves[1] ? halves[1].split(':') : [];
  const parts = halves.length === 2 ? [...left, ...Array(8-left.length-right.length).fill('0'), ...right] : left;
  return {value: parts.reduce((n, word) => (n << 16n) | BigInt('0x' + word), 0n), bits: 128};
}
export function formatAddress(value: bigint, bits: number): string {
  if (bits === 32) return [24n,16n,8n,0n].map(shift => String((value >> shift) & 255n)).join('.');
  return Array.from({length:8}, (_, index) => ((value >> BigInt((7-index)*16)) & 65535n).toString(16)).join(':');
}
const mask = (bits: number, prefix: number) => ((1n << BigInt(bits))-1n) ^ ((1n << BigInt(bits-prefix))-1n);
const network = (value: bigint, bits: number, prefix: number) => value & mask(bits,prefix);
interface Pool {base: bigint; prefix: number; bits: number}
const pool = (cidr: string): Pool => {const [text, prefix] = cidr.split('/'); return {...parseAddress(text), base: parseAddress(text).value, prefix: Number(prefix)};};
const contains = (p: Pool, value: bigint, bits: number) => p.bits === bits && network(value,bits,p.prefix) === p.base;
const v4Special = ['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'].map(pool);
const v6Special = ['2001::/23','2001:db8::/32','2002::/16','3fff::/20'].map(pool);
const classes: Record<string, Pool[]> = {
  private4: ['10.0.0.0/8','172.16.0.0/12','192.168.0.0/16'].map(pool),
  example4: ['192.0.2.0/24','198.51.100.0/24','203.0.113.0/24'].map(pool),
  shared4: ['100.64.0.0/10'].map(pool), link4: ['169.254.0.0/16'].map(pool), benchmark4: ['198.18.0.0/15'].map(pool),
  private6: ['fc00::/7'].map(pool), link6: ['fe80::/10'].map(pool), example6: ['2001:db8::/32','3fff::/20'].map(pool),
  public4: ['0.0.0.0/0'].map(pool), public6: ['2000::/3'].map(pool)
};
function classification(value: bigint, bits: number): string | undefined {
  for (const [name,pools] of Object.entries(classes)) if (!name.startsWith('public') && pools.some(p => contains(p,value,bits))) return name;
  if (bits === 32 && !v4Special.some(p => contains(p,value,bits))) return 'public4';
  if (bits === 128 && contains(classes.public6[0],value,bits) && !v6Special.some(p => contains(p,value,bits))) return 'public6';
  return undefined;
}
interface Group {base: bigint; bits: number; prefix: number; kind: string | undefined; destination?: bigint}
const overlaps = (a: Group, b: Group) => a.bits === b.bits && network(a.base,a.bits,Math.min(a.prefix,b.prefix)) === network(b.base,b.bits,Math.min(a.prefix,b.prefix));
function homogeneous(group: Group): boolean {
  if (!group.kind) return false;
  const last = group.base + (1n << BigInt(group.bits-group.prefix))-1n;
  if (classification(last,group.bits) !== group.kind) return false;
  if (group.kind.startsWith('public')) return !(group.bits===32?v4Special:v6Special).some(p => overlaps(group,{base:p.base,bits:p.bits,prefix:p.prefix,kind:undefined}));
  return classes[group.kind].some(p => p.prefix <= group.prefix && contains(p,group.base,group.bits));
}
/** Allocate disjoint networks. Preserve host offsets and observed subnet containment. */
export function mapAddresses(source: string, spans: Span[], key: Buffer): Map<number,string | undefined> {
  const defaults = spans.filter(s => s.category === 'IP' && s.prefix === 0 && isIP(source.slice(s.start,s.end)) && !source.slice(s.start,s.end).includes('%') && parseAddress(source.slice(s.start,s.end)).value===0n);
  const defaultStarts = new Set(defaults.map(s=>s.start));
  const entries = spans.filter(s => s.category === 'IP' && !defaultStarts.has(s.start) && isIP(source.slice(s.start,s.end)) && !source.slice(s.start,s.end).includes('%') && s.prefix!==-1).map(span => ({span, ...parseAddress(source.slice(span.start,span.end))}));
  if(new Set(entries.map(e=>`${e.bits}:${e.value}`)).size>2048) return new Map();
  const groups: Group[] = [];
  const unique = [...new Map(entries.map(e=>[`${e.bits}:${e.value}:${e.span.prefix}`,e])).values()];
  for (const entry of unique.sort((a,b) => (a.span.prefix ?? a.bits)-(b.span.prefix ?? b.bits))) {
    const prefix = entry.span.prefix ?? entry.bits, base = network(entry.value,entry.bits,prefix);
    if (!groups.some(g => g.bits===entry.bits && g.prefix <= prefix && network(base,entry.bits,g.prefix)===g.base)) groups.push({base,bits:entry.bits,prefix,kind:classification(base,entry.bits)});
  }
  const allocated: Group[] = [];
  for (const group of groups) {
    if (!homogeneous(group)) continue;
    const pools = classes[group.kind!].filter(p => p.prefix <= group.prefix);
    for (let attempt=0; attempt<2048 && pools.length; attempt++) {
      const digest = createHmac('sha256',key).update(`${group.bits}:${group.base}:${group.prefix}:${attempt}`).digest('hex');
      const random = BigInt('0x'+digest), p = pools[Number(random % BigInt(pools.length))];
      const slots = 1n << BigInt(group.prefix-p.prefix), base = p.base + ((random >> 8n) % slots << BigInt(group.bits-group.prefix));
      const candidate = {...group,base};
      if (homogeneous(candidate) && !groups.some(g => overlaps(candidate,g)) && !allocated.some(g => overlaps(candidate,g))) {group.destination=base;allocated.push(candidate);break;}
    }
  }
  const result = new Map<number,string | undefined>(defaults.map(s=>[s.start,source.slice(s.start,s.end)]));
  for (const entry of entries) {
    const group = groups.find(g => g.bits===entry.bits && network(entry.value,entry.bits,g.prefix)===g.base);
    result.set(entry.span.start,group?.destination === undefined ? undefined : formatAddress(group.destination + entry.value-group.base,entry.bits));
  }
  return result;
}

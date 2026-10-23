export type Category = 'SECRET' | 'HOST' | 'DOMAIN' | 'USER' | 'IP' | 'MAC' | 'NAME' | 'TEXT' | 'MANUAL';
export type AddressMode = 'labels' | 'addresses';
export interface Span {start: number; end: number; category: Category; rule: string; priority: number; prefix?: number}
export interface Flag {start: number; end: number; rule: string}
export interface Scan {spans: Span[]; flags: Flag[]}
export interface Replacement extends Span {label: string; line: number}
export interface Result {output: string; replacements: Replacement[]; flags: (Flag & {line: number})[]}
export const LIMIT = 5 * 1024 * 1024;

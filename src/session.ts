import {manualSpans, replace} from './replacements';
import {randomBytes} from 'node:crypto';
import {AddressMode, Result, Scan} from './types';
export class ReviewSession {
  source = ''; version = -1; result?: Result; stale = true; reviewed = false;
  addressMode: AddressMode = 'labels'; private key = randomBytes(32);
  private scan?: Scan; private selections: {start: number; end: number}[] = [];
  load(source: string, version: number, scan: Scan): void {this.source = source; this.version = version; this.scan = scan; this.selections = []; this.key=randomBytes(32); this.result = replace(source, scan, [], {addressMode:this.addressMode,key:this.key}); this.stale = false; this.reviewed = false;}
  invalidate(): void {this.stale = true; this.reviewed = false; this.result = undefined; this.source = ''; this.scan = undefined; this.selections = []; this.key.fill(0);}
  mask(start: number, end: number): void {if (this.stale || !this.scan) throw new Error('Scan the current source first.'); this.selections.push({start,end}); this.result = replace(this.source, this.scan, manualSpans(this.source, this.selections), {addressMode:this.addressMode,key:this.key}); this.reviewed = false;}
  setAddressMode(mode: unknown): void {if(mode!=='labels' && mode!=='addresses') throw new Error('Choose a supported address mode.'); if(this.stale || !this.scan) throw new Error('Scan the current source first.'); const result=replace(this.source,this.scan,manualSpans(this.source,this.selections),{addressMode:mode,key:this.key});this.addressMode=mode;this.result=result;this.reviewed=false;}
  acknowledge(value: boolean): void {this.reviewed = value === true && !this.stale && !!this.result && this.result.flags.length === 0;}
  export(version: number): string {if (this.stale || version !== this.version || !this.result) throw new Error('The preview is outdated. Scan the current source first.'); if (this.result.flags.length) throw new Error('Mask each flagged section before export.'); if (!this.reviewed) throw new Error('Review the comparison and confirm the review before export.'); return this.result.output;}
  dispose(): void {this.invalidate();}
  metadata() {return {addressMode:this.addressMode,stale: this.stale, reviewed: this.reviewed, canExport: !this.stale && this.reviewed && !!this.result && this.result.flags.length === 0,
    replacements: this.result?.replacements.map(({category,label,line,rule}) => ({category,label,line,rule})) || [],
    flags: this.result?.flags.map(({rule,line},index) => ({index,rule,line})) || []};}
}

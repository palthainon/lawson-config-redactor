import {DeviceProfile, isProfile} from './profiles';
import {manualSpans, replace} from './replacements';
import {randomBytes} from 'node:crypto';
import {AddressMode, Result, Scan} from './types';
export class ReviewSession {
  profile: DeviceProfile = 'cisco-ios';
  setProfile(value: unknown): void {if(!isProfile(value))throw new Error('Choose a supported device profile.');if(value!==this.profile){this.profile=value;this.invalidate();}}
  source = ''; version = -1; result?: Result; stale = true; compared = false;
  addressMode: AddressMode = 'labels'; private key = randomBytes(32);
  private scan?: Scan; private selections: {start: number; end: number}[] = [];
  load(source: string, version: number, scan: Scan): void {this.source = source; this.version = version; this.scan = scan; this.selections = []; this.key=randomBytes(32); this.result = replace(source, scan, [], {addressMode:this.addressMode,key:this.key}); this.stale = false; this.compared = false;}
  invalidate(): void {this.stale = true; this.compared = false; this.result = undefined; this.source = ''; this.scan = undefined; this.selections = []; this.key.fill(0);}
  mask(start: number, end: number): void {if (this.stale || !this.scan) throw new Error('Scan the current source first.'); this.selections.push({start,end}); this.result = replace(this.source, this.scan, manualSpans(this.source, this.selections), {addressMode:this.addressMode,key:this.key}); this.compared = false;}
  setAddressMode(mode: unknown): void {if(mode!=='labels' && mode!=='addresses') throw new Error('Choose a supported address mode.'); if(this.stale || !this.scan) throw new Error('Scan the current source first.'); const result=replace(this.source,this.scan,manualSpans(this.source,this.selections),{addressMode:mode,key:this.key});this.addressMode=mode;this.result=result;this.compared=false;}
  markCompared(): void {this.compared = !this.stale && !!this.result && this.result.flags.length === 0;}
  export(version: number): string {if (this.stale || version !== this.version || !this.result) throw new Error('The preview is outdated. Scan the current source first.'); if (this.result.flags.length) throw new Error('Mask each flagged section before export.'); if (!this.compared) throw new Error('Open the current comparison before export.'); return this.result.output;}
  dispose(): void {this.invalidate();}
  metadata() {return {profile:this.profile,addressMode:this.addressMode,stale: this.stale, compared: this.compared, canExport: !this.stale && this.compared && !!this.result && this.result.flags.length === 0,
    replacements: this.result?.replacements.map(({category,label,line,rule}) => ({category,label,line,rule})) || [],
    flags: this.result?.flags.map(({rule,line},index) => ({index,rule,line})) || []};}
}

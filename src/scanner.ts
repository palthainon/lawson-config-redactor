import {scan as scanCisco, linesOf} from './cisco';
import {DeviceProfile, isProfile} from './profiles';
import {scanCli, scanXml, scanDell} from './vendors';
import {LIMIT, Scan} from './types';
export {linesOf} from './cisco';
export function scan(source: string, profile: DeviceProfile = 'cisco-ios'): Scan {
  if (Buffer.byteLength(source) > LIMIT) throw new Error('The configuration exceeds the 5 MiB limit.');
  if (!isProfile(profile)) throw new Error('Choose a supported device profile.');
  const blocked = (rule: string): Scan => ({spans:[],flags:[{start:0,end:source.length,rule}]});
  if (profile === 'panos-xml') return scanXml(source);
  if (profile === 'panos-set' || profile === 'junos-set' || profile === 'junos-hierarchical') return scanCli(source,profile);
  if (/^\s*</.test(source) || linesOf(source).some(line => /^\s*(?:set|delete|activate|deactivate)\s/.test(line.text)) ||
      /^\s*(?:system|security|interfaces|routing-options|mgt-config|deviceconfig|network|shared|vsys)\s*\{/m.test(source))
    return blocked('The configuration does not match this CLI profile. Select its vendor and format.');
  return profile === 'cisco-ios' ? scanCisco(source) : scanDell(source,profile,scanCisco(source));
}

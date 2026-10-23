export const PROFILES = [
  {id:'cisco-ios', label:'Cisco IOS / IOS-XE', format:'CLI configuration'},
  {id:'panos-set', label:'Palo Alto PAN-OS — set commands', format:'Full set configuration'},
  {id:'panos-xml', label:'Palo Alto PAN-OS — XML', format:'XML export; values are masked conservatively'},
  {id:'junos-set', label:'Juniper Junos — set commands', format:'Full display set configuration'},
  {id:'junos-hierarchical', label:'Juniper Junos — hierarchy', format:'Configuration with braces and semicolons'},
  {id:'dell-os6', label:'Dell Networking OS6', format:'CLI configuration'},
  {id:'dell-os9', label:'Dell Networking OS9 / FTOS', format:'CLI configuration'},
  {id:'dell-os10', label:'Dell SmartFabric OS10', format:'CLI configuration'}
] as const;
export type DeviceProfile = typeof PROFILES[number]['id'];
export function isProfile(value: unknown): value is DeviceProfile {
  return typeof value === 'string' && PROFILES.some(profile => profile.id === value);
}

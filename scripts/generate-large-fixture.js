// Generate synthetic test input. Public addresses identify ranges only. No connection occurs.
const fs=require('node:fs'),path=require('node:path');
const folder=path.join(__dirname,'../test/fixtures');
const encoded=JSON.parse(fs.readFileSync(path.join(folder,'encoded.json'),'utf8'));
const lines=[],secrets=new Set(),addressKinds=new Map(),networks=[];
const line=(...values)=>lines.push(...values);
const secret=value=>{secrets.add(value);return value;};
const ip=(value,kind)=>{addressKinds.set(value,kind);return value;};
const group=(network,prefix,members,kind)=>{ip(network,kind);members.forEach(value=>ip(value,kind));networks.push({network,prefix,members,kind});};
line('! Synthetic Cisco IOS-XE review input. Do not deploy this file.',
 '! Public ranges are artificial topology values. They are not company addresses.',
 'hostname CLIENT-A','ip domain name review.invalid','service password-encryption',
 `enable secret 5 ${secret(encoded.type5)}`,`enable password 7 ${secret(encoded.type7)}`,
 `username SEED-ADMIN privilege 15 secret 9 ${secret('SEED-ADMIN-TYPE9')}`,
 `username SEED-OPERATOR secret 8 ${secret('SEED-OPERATOR-TYPE8')}`,
 'aaa new-model','aaa authentication login default group tacacs+ local',
 'tacacs server REVIEW-TACACS',` address ipv4 ${ip('10.42.1.20','private4')}`,` key 6 ${secret('SEED-TACACS-TYPE6')}`,'!',
 'radius server REVIEW-RADIUS',` address ipv4 ${ip('172.20.1.20','private4')} auth-port 1812 acct-port 1813`,` key 7 ${secret(encoded.type7)}`,'!',
 'aaa group server tacacs+ REVIEW-AAA',` server-private ${ip('192.168.1.20','private4')} key 0 ${secret('SEED-PRIVATE-SERVER')}`,'!',
 `tacacs-server key 7 ${secret(encoded.type7)}`,`radius-server key 0 ${secret('SEED-LEGACY-RADIUS')}`,
 `snmp-server community ${secret('SEED-SNMP-COMMUNITY')} RO`,
 `snmp-server user SEED-SNMP-USER REVIEW-SNMP v3 auth md5 ${secret('SEED-SNMP-AUTH')} priv aes 128 ${secret('SEED-SNMP-PRIV')}`,
 `snmp-server host ${ip('8.8.8.25','public4')} version 2c ${secret('SEED-SNMP-DESTINATION')}`,
 `ntp authentication-key 10 md5 ${secret('SEED-NTP-MD5')} 7`,
 `crypto isakmp key ${secret('SEED-IPSEC-SHARED')} address ${ip('9.9.9.25','public4')}`,
 'crypto ikev2 keyring REVIEW-IKE',' peer REVIEW-PEER',`  address ${ip('9.9.9.2','public4')}`,`  pre-shared-key local 6 ${secret('SEED-IKE-LOCAL')}`,`  pre-shared-key remote 6 ${secret('SEED-IKE-REMOTE')}`,'!',
 'banner login ^C','Synthetic review banner. Contact SEED-BANNER-OWNER.','^C','!');
for(const [index,base] of ['8.8.8','9.9.9'].entries()) {
 group(base+'.0',24,[base+'.1',base+'.2',base+'.25'],'public4');
 line(`interface GigabitEthernet0/0/${index}`,` description Synthetic public uplink ${index}`,` ip address ${base}.1 255.255.255.0`,'!',`ip prefix-list PUBLIC-${index} seq 10 permit ${base}.0/24`);
}
group('2606:4700:42::',48,[],'public6');group('fd42:1234:5678::',48,[],'private6');
line('ipv6 prefix-list PUBLIC-V6 permit 2606:4700:42::/48 le 64','ipv6 prefix-list PRIVATE-V6 permit fd42:1234:5678::/48 le 64');
const vlanRows=[];
for(let index=1;index<=48;index++) {
 const number=String(index).padStart(3,'0'),family=['10.42','172.20','192.168'][(index-1)%3],subnet=Math.floor((index-1)/3)+1,base=`${family}.${subnet}`,hex=index.toString(16);
 const pub6=`2606:4700:42:${hex}::`,priv6=`fd42:1234:5678:${hex}::`;
 group(base+'.0',24,[base+'.1',base+'.2',base+'.25',base+'.254'],'private4');
 group(pub6,64,[pub6+'1',pub6+'2'],'public6');group(priv6,64,[priv6+'1',priv6+'2'],'private6');
 networks.find(n=>n.network==='2606:4700:42::').members.push(pub6,pub6+'1',pub6+'2');
 networks.find(n=>n.network==='fd42:1234:5678::').members.push(priv6,priv6+'1',priv6+'2');
 line(`key chain OSPF-CHAIN-${number}`,' key 1',`  key-string 0 ${secret('SEED-CHAIN-'+number)}`,'  cryptographic-algorithm hmac-sha-256','!',
 `ip access-list extended REVIEW-ACL-${number}`,` 10 remark Synthetic subnet ${number}`,` 20 permit ip ${base}.0 0.0.0.255 any`,` 30 permit tcp host ${base}.25 host 8.8.8.25 eq 443`,' 40 deny ip any any','!',
 `ip prefix-list PRIVATE-${number} seq 10 permit ${base}.0/24`,
 `ipv6 prefix-list PUBLIC-SUBNET-${number} permit ${pub6}/64`,`ipv6 prefix-list PRIVATE-SUBNET-${number} permit ${priv6}/64`,
 `interface Vlan${100+index}`,` description Synthetic engineering subnet ${number}`,` ip address ${base}.1 255.255.255.0`,
 ` ipv6 address ${pub6}1/64`,` ipv6 address ${priv6}1/64`,` ip access-group REVIEW-ACL-${number} in`,
 ` ip ospf authentication key-chain OSPF-CHAIN-${number}`,` standby 1 authentication md5 key-string 0 ${secret('SEED-HSRP-'+number)}`,'!',
 `ip route ${base}.0 255.255.255.0 ${base}.254`,
 `ipv6 route ${pub6}/64 ${pub6}2`,`ipv6 route ${priv6}/64 ${priv6}2`);
 vlanRows.push({base,pub6,priv6,number});
}
for(const family of ['10.42','172.20','192.168']) {
 group(family+'.0.0',16,[...addressKinds.keys()].filter(value=>value.startsWith(family+'.')),'private4');
 line(`ip prefix-list SUMMARY-${family.replace('.','-')} seq 10 permit ${family}.0.0/16 le 24`);
}
line('router ospf 100');
for(const {base} of vlanRows)line(` network ${base}.0 0.0.0.255 area 0`);
line('!','router bgp 65000');
for(const {base,pub6,number} of vlanRows)line(` neighbor ${base}.2 remote-as 65001`,` neighbor ${base}.2 password 0 ${secret('SEED-BGP-'+number)}`,` neighbor ${pub6}2 remote-as 65002`,` neighbor ${pub6}2 password 7 ${secret(encoded.type7)}`);
line(` neighbor 8.8.8.2 remote-as 65010`,` neighbor 8.8.8.2 password 7 ${secret(encoded.type7)}`,` neighbor 9.9.9.2 remote-as 65020`,` neighbor 9.9.9.2 password 0 ${secret('SEED-PUBLIC-BGP')}`,
 ' network 8.8.8.0 mask 255.255.255.0',' network 9.9.9.0 mask 255.255.255.0','!',
 'interface Tunnel10',` ip ospf authentication-key 7 ${secret(encoded.type7)}`,` ip ospf message-digest-key 1 md5 7 ${secret(encoded.type7)}`,'!',
 'line console 0',` password 0 ${secret('SEED-CONSOLE')}`,' login','!','line vty 0 15',` password 7 ${secret(encoded.type7)}`,' login authentication default','!',
 'ip route 0.0.0.0 0.0.0.0 8.8.8.2','ipv6 route ::/0 2606:4700:42:1::2','end');
const source=lines.join('\r\n')+'\r\n';
fs.writeFileSync(path.join(folder,'large-cisco.ios'),source);
fs.writeFileSync(path.join(folder,'large-cisco.expected.json'),JSON.stringify({note:'Synthetic input expectations. This file contains no replacement mapping.',lines:lines.length,bytes:Buffer.byteLength(source),secrets:[...secrets],addresses:[...addressKinds].map(([value,kind])=>({value,kind})),networks},null,2)+'\n');
console.log(JSON.stringify({lines:lines.length,bytes:Buffer.byteLength(source),distinctSecrets:secrets.size,distinctAddresses:addressKinds.size,networkChecks:networks.length}));

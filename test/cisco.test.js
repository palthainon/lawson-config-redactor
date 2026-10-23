const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {isIP}=require('node:net');
const {scan}=require('../dist/scanner');
const {replace,manualSpans}=require('../dist/replacements');
const {parseAddress,formatAddress}=require('../dist/addresses');
const {ReviewSession}=require('../dist/session');
const options={addressMode:'addresses',key:Buffer.alloc(32,19)};
const redact=source=>replace(source,scan(source),[],options);
const addresses=result=>result.replacements.filter(r=>r.category==='IP');
const value=text=>parseAddress(text).value;
const network=(text,prefix)=>value(text)>>BigInt((isIP(text)===4?32:128)-prefix);
const private4=text=>{const n=value(text);return n>>24n===10n || n>>20n===2753n || n>>16n===49320n;};

for(const type of [0,4,5,6,7,8,9]) {
  for(const command of ['enable secret','username SEED-USER secret','username SEED-USER password']) {
    test(`password type ${type}: ${command}`,()=>{
      const source=`${command} ${type} SEED-VALUE-${type}`;
      for(const result of [replace(source,scan(source)),redact(source)]) {
        assert.equal(result.flags.length,0);assert.ok(!result.output.includes('SEED-'));
        assert.ok(result.output.includes(`${type} <SECRET_001>`));
      }
    });
  }
}
const forms=[
 ['tacacs-server key 0 SEED-TACACS','TACACS cleartext'],
 ['tacacs server REVIEW\n key 7 SEED-TACACS\n!','TACACS type 7'],
 ['radius server REVIEW\n key 6 SEED-RADIUS\n!','RADIUS type 6'],
 ['aaa group server tacacs+ REVIEW\n server-private 192.0.2.8 key 7 SEED-KEY\n!','private authentication server'],
 ['aaa group server radius REVIEW\n server-private 192.0.2.8 auth-port 1812 acct-port 1813 key 0 SEED-KEY\n!','private RADIUS server'],
 ['neighbor 192.0.2.1 password 0 SEED-BGP','BGP cleartext'],
 ['neighbor 192.0.2.1 password 7 SEED-BGP','BGP type 7'],
 ['ip ospf authentication-key 7 SEED-OSPF','OSPF type 7'],
 ['ip ospf message-digest-key 1 md5 SEED-OSPF','OSPF MD5 cleartext'],
 ['ip ospf message-digest-key 1 md5 7 SEED-OSPF','OSPF MD5 type 7'],
 ['key chain CHAIN\n key 10\n  key-string 7 SEED-CHAIN\n  cryptographic-algorithm hmac-sha-256\ninterface GigabitEthernet0/1\n ip ospf authentication key-chain CHAIN','OSPF key chain'],
 ['ppp pap sent-username SEED-USER password 7 SEED-PPP','PPP PAP credentials'],
 ['ppp chap hostname SEED-USER\nppp chap password 0 SEED-PPP','PPP CHAP credentials'],
 ['snmp-server user SEED-USER GROUP v3 auth md5 SEED-AUTH priv aes 256 SEED-PRIV','SNMP MD5 and privacy'],
 ['ntp authentication-key 10 md5 SEED-NTP 7','NTP MD5'],
 ['standby 1 authentication md5 key-string 7 SEED-STANDBY','HSRP MD5'],
 ['crypto isakmp key 6 SEED-IPSEC address 192.0.2.1','IPsec encoded key'],
 ['pre-shared-key remote 6 "SEED QUOTED KEY"','quoted key']
];
for(const [source,name] of forms) test(name,()=>{
 for(const result of [replace(source,scan(source)),redact(source)]) {
   assert.equal(result.flags.length,0);assert.ok(!/SEED[- ]/.test(result.output));assert.match(result.output,/<SECRET_\d+>/);
 }
});
test('Cisco lab fixture removes every seeded secret in both export modes',()=>{
 const source=fs.readFileSync(path.join(__dirname,'fixtures/cisco-labs.ios'),'utf8');
 for(const mode of ['labels','addresses']) {
   const session=new ReviewSession();session.load(source,1,scan(source));session.setAddressMode(mode);
   assert.equal(session.result.flags.length,0);session.acknowledge(true);
   const output=session.export(1);assert.ok(!output.includes('SEED-'));assert.equal(session.source,source);
   assert.equal(output.split('\n').length,source.split('\n').length);
   assert.ok(output.includes('network '));assert.ok(output.includes(' 0.0.0.255 area 0'));
   assert.ok(output.includes('Loopback70'));assert.ok(output.includes('255.255.255.0'));
 }
});
test('new IPv4 addresses preserve hosts, subnets, references, and public or private class',()=>{
 const source='interface GigabitEthernet0/0\n ip address 10.23.45.1 255.255.255.0\nip route 10.23.45.0 255.255.255.0 10.23.45.2\nneighbor 10.23.45.2 remote-as 65001\ninterface GigabitEthernet0/1\n ip address 8.8.8.1 255.255.255.0\nneighbor 8.8.8.2 remote-as 65002';
 const result=redact(source), rows=addresses(result);assert.equal(result.flags.length,0);
 const mapped=new Map(rows.map(r=>[source.slice(r.start,r.end),r.label]));
 for(const [original,replacement] of mapped) {assert.equal(isIP(replacement),4);assert.notEqual(replacement,original);assert.equal(private4(replacement),private4(original));}
 assert.equal(network(mapped.get('10.23.45.1'),24),network(mapped.get('10.23.45.2'),24));
 assert.equal(value(mapped.get('10.23.45.2'))-value(mapped.get('10.23.45.0')),2n);
 assert.equal(network(mapped.get('8.8.8.1'),24),network(mapped.get('8.8.8.2'),24));
 assert.equal(rows.filter(r=>source.slice(r.start,r.end)==='10.23.45.2')[0].label,rows.filter(r=>source.slice(r.start,r.end)==='10.23.45.2')[1].label);
 assert.ok(result.output.includes('255.255.255.0'));assert.ok(!result.output.includes('<IP_'));
});
test('IPv6 compression, public addresses, private addresses, and prefix references stay consistent',()=>{
 const source='ipv6 address 2606:4700:1234:5678::1/64\nipv6 route 2606:4700:1234:5678::/64 2606:4700:1234:5678::2\nipv6 address fd12:3456:789a:1::1/64\nipv6 route fd12:3456:789a:1::/64 fd12:3456:789a:1::2\nneighbor FD12:3456:789A:1:0:0:0:2 remote-as 65001';
 const result=redact(source);assert.equal(result.flags.length,0);
 const rows=addresses(result);assert.equal(rows.length,7);for(const row of rows)assert.equal(isIP(row.label),6);
 assert.equal(network(rows[0].label,64),network(rows[2].label,64));
 assert.equal(network(rows[3].label,7),126n);assert.equal(rows[5].label,rows[6].label);
 assert.equal(value(rows[5].label)-value(rows[4].label),2n);assert.ok(result.output.includes('/64'));
});
test('documentation ranges stay documentation ranges',()=>{
 const result=redact('ip address 192.0.2.1 255.255.255.0\nipv6 address 2001:db8:1234::1/64');
 assert.equal(result.flags.length,0);assert.ok(/^(198\.51\.100|203\.0\.113)\./.test(addresses(result)[0].label));
});
test('OSPF wildcard and BGP network masks remain visible',()=>{
 const source='network 10.23.45.0 0.0.0.255 area 0\nnetwork 10.23.45.0 mask 255.255.255.0\nip address 10.23.45.1 255.255.255.0';
 const result=redact(source);assert.equal(result.flags.length,0);assert.equal(addresses(result).length,3);
 assert.ok(result.output.includes('0.0.0.255 area 0'));assert.ok(result.output.includes('mask 255.255.255.0'));
 assert.equal(addresses(result)[0].label,addresses(result)[1].label);
});
test('default route zero addresses remain structural in the new address mode',()=>{
 const result=redact('ip route 0.0.0.0 0.0.0.0 10.23.45.2\nipv6 route ::/0 fd12::2');
 assert.equal(result.flags.length,0);assert.ok(result.output.startsWith('ip route 0.0.0.0 0.0.0.0 '));assert.ok(result.output.includes('ipv6 route ::/0 '));
});
test('impossible remapping blocks export and labels provide a safe alternative',()=>{
 const source='ip route 10.0.0.0 255.0.0.0 192.0.2.1';const session=new ReviewSession();session.load(source,1,scan(source));session.setAddressMode('addresses');
 assert.ok(session.result.flags.length);session.acknowledge(true);assert.throws(()=>session.export(1),/flagged/);
 assert.ok(!session.result.output.includes('10.0.0.0'));session.setAddressMode('labels');assert.equal(session.result.flags.length,0);
 session.acknowledge(true);assert.match(session.export(1),/<IP_001>/);
});
test('special addresses and noncontiguous wildcards fail closed in numeric mode',()=>{
 for(const source of ['neighbor 224.0.0.1 remote-as 65001','permit ip 10.1.2.3 0.255.0.255 any']) {
   const result=redact(source);assert.ok(result.flags.length);assert.match(result.output,/<IP_/);
 }
});
test('address mode changes require another review and retain manual masks',()=>{
 const source='ip address 10.23.45.1 255.255.255.0\nunknown SEED-MANUAL';const session=new ReviewSession();session.load(source,1,scan(source));session.mask(source.indexOf('SEED-'),source.length);session.acknowledge(true);
 session.setAddressMode('addresses');assert.equal(session.reviewed,false);assert.throws(()=>session.export(1),/Review/);assert.ok(!session.result.output.includes('SEED-'));
 const output=session.result.output;session.setAddressMode('labels');session.setAddressMode('addresses');assert.equal(session.result.output,output);
 assert.throws(()=>session.setAddressMode('external'),/supported/);session.invalidate();assert.throws(()=>session.setAddressMode('labels'),/Scan/);
});
test('partial manual IP selections cannot expose fragments or crash the mapper',()=>{
 const source='neighbor 10.23.45.1 remote-as 65001', start=source.indexOf('23');
 const result=replace(source,scan(source),manualSpans(source,[{start,end:start+2}]),options);
 assert.ok(!result.output.includes('10.'));assert.ok(!result.output.includes('45.1'));assert.ok(result.flags.length);
});
test('canonical IPv6 round trips include embedded IPv4',()=>{
 for(const input of ['::','::1','2001:db8::1','::ffff:192.0.2.1','fd12:3456:789a:1:2:3:4:5']) {
 const parsed=parseAddress(input);assert.equal(parseAddress(formatAddress(parsed.value,parsed.bits)).value,parsed.value);}
});
test('mapping is stable for a scan key and changes for a new key',()=>{
 const source='ip address 10.23.45.1 255.255.255.0';assert.equal(redact(source).output,redact(source).output);
 assert.notEqual(redact(source).output,replace(source,scan(source),[],{addressMode:'addresses',key:Buffer.alloc(32,20)}).output);
});
test('mixed newline styles and credential priority remain intact in numeric mode',()=>{
 const source='username SEED-USER secret 7 10.23.45.1\r\nip address 10.23.45.2 255.255.255.0\rneighbor 10.23.45.2 password 7 SEED-BGP\n';
 const result=redact(source);assert.equal(result.flags.length,0);assert.equal(addresses(result).length,2);
 assert.deepEqual(result.output.match(/\r\n|\r|\n/g),source.match(/\r\n|\r|\n/g));assert.ok(!result.output.includes('SEED-'));assert.ok(!result.output.includes('10.23.45.1'));
});

test('numeric mode flags scoped IPv6 addresses without a mapping exception',()=>{
 const result=redact('neighbor fe80::1%eth0 remote-as 65001');assert.ok(result.flags.length);assert.ok(!result.output.includes('fe80::1'));
});
test('a partial manual mask of a default route does not crash mapping',()=>{
 const source='ip route 0.0.0.0 0.0.0.0 192.0.2.1', start=source.indexOf('0.0');
 const result=replace(source,scan(source),manualSpans(source,[{start,end:start+3}]),options);assert.ok(result.flags.length);assert.notEqual(addresses(result).at(-1).label,'192.0.2.1');
});
test('large numeric maps block export above the distinct address limit',()=>{
 const source=Array.from({length:2049},(_,i)=>`neighbor 10.23.${Math.floor(i/256)}.${i%256} remote-as 65001`).join('\n');
 const result=redact(source);assert.ok(result.flags.length);assert.ok(!result.output.includes('10.23.'));
});

test('realistic synthetic MD5 crypt and type 7 values disappear in both modes',()=>{
 const encoded=require('./fixtures/encoded.json');
 const source=`username REVIEW-MD5 secret 5 ${encoded.type5}\nusername REVIEW-TYPE7 password 7 ${encoded.type7}\nneighbor 192.0.2.1 password 7 ${encoded.type7}\nip ospf message-digest-key 1 md5 7 ${encoded.type7}`;
 for(const result of [replace(source,scan(source)),redact(source)]) {
   assert.equal(result.flags.length,0);assert.ok(!result.output.includes(encoded.type5));assert.ok(!result.output.includes(encoded.type7));
   assert.ok(!JSON.stringify(result.replacements.map(({label,category,line,rule})=>({label,category,line,rule}))).includes(encoded.type5));
   const secrets=result.replacements.filter(r=>r.category==='SECRET');assert.equal(secrets[1].label,secrets[2].label);assert.equal(secrets[2].label,secrets[3].label);
 }
});

test('nested prefixes and disjoint source networks remain consistent without collisions',()=>{
 const source='ip route 10.23.0.0 255.255.0.0 192.0.2.2\nip address 10.23.45.1 255.255.255.0\nip route 10.23.45.0 255.255.255.0 10.23.45.2\nip address 10.24.45.1 255.255.255.0';
 for(let key=0;key<30;key++) {
   const result=replace(source,scan(source),[],{addressMode:'addresses',key:Buffer.alloc(32,key)});assert.equal(result.flags.length,0);
   const mapped=new Map(addresses(result).map(r=>[source.slice(r.start,r.end),r.label]));
   assert.equal(new Set(mapped.values()).size,mapped.size);
   for(const [original,replacement] of mapped) {assert.notEqual(original,replacement);assert.ok(!mapped.has(replacement));}
   assert.equal(network(mapped.get('10.23.0.0'),16),network(mapped.get('10.23.45.1'),16));
   assert.equal(network(mapped.get('10.23.45.0'),24),network(mapped.get('10.23.45.2'),24));
   assert.notEqual(network(mapped.get('10.23.45.1'),24),network(mapped.get('10.24.45.1'),24));
 }
});
test('unknown credential encodings stay masked and block export',()=>{
 const source='username REVIEW secret 10 SEED-UNKNOWN';const result=redact(source);
 assert.ok(!result.output.includes('SEED-'));assert.ok(result.flags.some(f=>f.rule==='Unknown credential encoding type'));
});

const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {scan}=require('../dist/scanner');const {replace,manualSpans}=require('../dist/replacements');const {ReviewSession}=require('../dist/session');const {saveCopy}=require('../dist/files');const {LIMIT}=require('../dist/types');
const redact=text=>replace(text,scan(text));
const forms=[
 ['enable secret 9 SEED-HASH','SEED-HASH'],['enable password level 15 7 SEED-ENABLE','SEED-ENABLE'],
 ['username SEED-USER privilege 15 secret 9 SEED-HASH','SEED-HASH'],['username SEED-USER password 0 "SEED QUOTED"','SEED QUOTED'],
 ['line vty 0 4\n password 7 SEED-LINE','SEED-LINE'],['snmp-server community SEED-COMMUNITY RO','SEED-COMMUNITY'],
 ['snmp-server user SEED-USER group v3 auth sha SEED-AUTH priv aes 128 SEED-PRIV','SEED-AUTH'],
 ['tacacs-server key 7 SEED-TACACS','SEED-TACACS'],['radius-server host 192.0.2.4 key 7 SEED-RADIUS','SEED-RADIUS'],
 ['radius server TEST\n key 6 SEED-SERVER\n!','SEED-SERVER'],['tacacs server TEST\n key 0 SEED-SERVER\n!','SEED-SERVER'],
 ['key chain CHAIN\n key 1\n  key-string 7 SEED-CHAIN','SEED-CHAIN'],['ntp authentication-key 1 md5 SEED-NTP 7','SEED-NTP'],
 ['neighbor 192.0.2.1 password 7 SEED-BGP','SEED-BGP'],['ip ospf authentication-key SEED-OSPF','SEED-OSPF'],
 ['ip ospf message-digest-key 1 md5 SEED-DIGEST','SEED-DIGEST'],['standby 1 authentication md5 key-string 7 SEED-HSRP','SEED-HSRP'],
 ['crypto isakmp key SEED-PSK address 192.0.2.8','SEED-PSK'],['pre-shared-key local 6 SEED-PSK','SEED-PSK'],
 ['snmp-server host 192.0.2.4 version 2c SEED-COMMUNITY','SEED-COMMUNITY'],['no username SEED-USER secret 9 SEED-HASH','SEED-HASH']
];
for(const [source,seed] of forms)test('credential: '+source.split(' ').slice(0,2).join(' '),()=>{const result=redact(source);assert.ok(!result.output.includes(seed));assert.equal(result.flags.length,0);assert.match(result.output,/<SECRET_\d+>/);});
test('repeated addresses and declarations keep stable labels',()=>{
 const result=redact('hostname CLIENT-A\nip access-list extended REVIEW-ACL\n 10 permit ip host 192.0.2.1 any\ninterface GigabitEthernet1/0/1\n ip address 192.0.2.1 255.255.255.0\n ip access-group REVIEW-ACL in\n');
 assert.ok(!result.output.includes('CLIENT-A'));assert.ok(!result.output.includes('REVIEW-ACL'));assert.equal((result.output.match(/<IP_001>/g)||[]).length,2);assert.equal((result.output.match(/<NAME_001>/g)||[]).length,2);assert.ok(result.output.includes('GigabitEthernet1/0/1'));assert.ok(result.output.includes('255.255.255.0'));
});
test('object references cover route maps, prefix lists, routing instances, and policies',()=>{
 const source='route-map ROUTE-NAME permit 10\nip prefix-list PREFIX-NAME seq 10 permit 192.0.2.0/24\nvrf definition VRF-NAME\nclass-map match-any CLASS-NAME\npolicy-map POLICY-NAME\n class CLASS-NAME\n match ip address prefix-list PREFIX-NAME\n ip vrf forwarding VRF-NAME\n service-policy input POLICY-NAME\n redistribute static route-map ROUTE-NAME';
 const result=redact(source);for(const name of ['ROUTE-NAME','PREFIX-NAME','VRF-NAME','CLASS-NAME','POLICY-NAME'])assert.ok(!result.output.includes(name));assert.ok(result.output.includes('/24'));
});
test('typed policy and class maps preserve their command keywords',()=>{const result=redact('class-map type inspect match-all DEMO-CLASS\npolicy-map type inspect DEMO-POLICY\n service-policy type inspect DEMO-POLICY');assert.ok(!result.output.includes('DEMO-CLASS'));assert.ok(!result.output.includes('DEMO-POLICY'));assert.ok(result.output.includes('policy-map type inspect'));assert.equal(result.flags.length,0);});
test('domain lookup settings stay keywords and server names are masked',()=>{const result=redact('ip domain lookup\nip domain retry 2\nradius server DEMO-RADIUS\n key 7 SEED-SERVER\n!');assert.ok(result.output.includes('ip domain lookup'));assert.ok(result.output.includes('ip domain retry 2'));assert.ok(!result.output.includes('DEMO-RADIUS'));});
test('SNMP authentication redaction preserves protocol options and ports',()=>{const source='snmp-server host 192.0.2.9 version 2c SEED-COMMUNITY udp-port 162\nsnmp-server user DEMO-USER DEMO-GROUP v3 auth sha SEED-AUTH priv aes 128 SEED-PRIV';const output=redact(source).output;for(const seed of ['SEED-COMMUNITY','SEED-AUTH','SEED-PRIV'])assert.ok(!output.includes(seed));assert.ok(output.includes('udp-port 162'));assert.ok(output.includes('auth sha'));assert.ok(output.includes('priv aes 128'));});
test('unknown SNMP authentication forms block export',()=>assert.ok(redact('snmp-server user DEMO-USER DEMO-GROUP v3 auth future SEED-UNKNOWN').flags.length));
test('ambiguous identifier names block export rather than replacing keywords',()=>assert.ok(redact('ip access-list extended interface\ninterface GigabitEthernet0/1').flags.length));
test('IPv6, MAC formats, route masks and wildcard masks',()=>{
 const result=redact('ipv6 address 2001:db8::1/64\nmac-address 0011.2233.4455\nmac-address 00:11:22:33:44:55\nip route 192.0.2.0 255.255.255.0 198.51.100.1\naccess-list 100 permit ip 192.0.2.0 0.0.0.255 any');
 for(const seed of ['2001:db8::1','0011.2233.4455','00:11:22:33:44:55','192.0.2.0','198.51.100.1'])assert.ok(!result.output.includes(seed));assert.ok(result.output.includes('/64'));assert.ok(result.output.includes('255.255.255.0'));assert.ok(result.output.includes('0.0.0.255'));
});
test('ACL masks do not hide destination addresses from the scanner',()=>{
 for(const source of ['access-list 100 permit ip 192.0.2.0 0.0.0.255 198.51.100.0 0.0.0.255',' 10 permit ip host 192.0.2.1 198.51.100.0 0.0.0.255']){const output=redact(source).output;assert.ok(!output.includes('198.51.100.0'));assert.ok(!output.includes('192.0.2.'));assert.ok(output.includes('0.0.0.255'));}
});
test('free text and banners keep all newline styles and indentation',()=>{
 const source='! SEED-COMMENT\r\n description SEED-DESC\n remark SEED-REMARK\rbanner motd ^C\r\n  SEED-BANNER\n^C\r\nend';const result=redact(source);
 assert.deepEqual(result.output.match(/\r\n|\r|\n/g),source.match(/\r\n|\r|\n/g));for(const seed of ['SEED-COMMENT','SEED-DESC','SEED-REMARK','SEED-BANNER'])assert.ok(!result.output.includes(seed));assert.match(result.output,/\n  <TEXT_/);assert.ok(result.output.endsWith('end'));
});
test('single-line banner preserves delimiters',()=>assert.match(redact('banner login #SEED-BANNER#').output,/^banner login #<TEXT_001>#$/));
test('unknown and incomplete blocks block export until fully masked',()=>{
 for(const source of ['banner motd ^C\nSEED-UNCLOSED','crypto private-key unsupported SEED-KEY','-----BEGIN PRIVATE KEY-----\nSEED-KEY']){
  const session=new ReviewSession();session.load(source,1,scan(source));assert.ok(session.result.flags.length);session.acknowledge(true);assert.throws(()=>session.export(1));const flag=session.result.flags[0];session.mask(flag.start,flag.end);assert.equal(session.result.flags.length,0);session.acknowledge(true);assert.ok(!session.export(1).includes('SEED-'));}
});
test('partial masks cannot dismiss flags',()=>{const source='crypto private-key unsupported SEED-KEY';const session=new ReviewSession();session.load(source,1,scan(source));session.mask(0,6);assert.equal(session.result.flags.length,1);});
test('encoded key and certificate blocks are opaque',()=>{
 for(const source of ['-----BEGIN PRIVATE KEY-----\nSEED-BODY\n-----END PRIVATE KEY-----','crypto pki certificate chain CHAIN\n certificate ca 01\n  SEED-BODY\n quit\n!\nend'])assert.ok(!redact(source).output.includes('SEED-BODY'));
});
test('certificate quit delimiters remain visible',()=>assert.match(redact('crypto pki certificate chain TEST\n certificate ca 01\n  SEED-BODY\n quit\n!').output,/\n quit\n!/));
test('manual literals redact every occurrence and do not expose overlapping secrets',()=>{
 const source='password SEED-ORIGINALTAIL\ndescription other\nunknown SEED-ORIGINALTAIL';const scanResult=scan(source),start=source.indexOf('SEED');const result=replace(source,scanResult,manualSpans(source,[{start,end:start+4}]));assert.ok(!result.output.includes('SEED'));assert.ok(!result.output.split('\n')[0].includes('ORIGINALTAIL'));
});
test('unknown credential blocks include their indented body',()=>{const source='crypto private-key unknown\n SEED-BODY\n!\nend';const session=new ReviewSession();session.load(source,1,scan(source));const flag=session.result.flags[0];assert.ok(source.slice(flag.start,flag.end).includes('SEED-BODY'));session.mask(flag.start,flag.end);session.acknowledge(true);assert.ok(!session.export(1).includes('SEED-BODY'));});
test('placeholder collisions are skipped and source order defines numbering',()=>{const result=redact('token <IP_001>\naddress 192.0.2.1\naddress 198.51.100.1');assert.ok(result.output.includes('<IP_002>'));assert.ok(result.output.includes('<IP_003>'));});
test('source versions, acknowledgement, and disposal gate exports',()=>{
 const session=new ReviewSession();session.load('hostname CLIENT-A',2,scan('hostname CLIENT-A'));assert.throws(()=>session.export(2));session.acknowledge(true);assert.ok(session.export(2));assert.throws(()=>session.export(3));session.invalidate();assert.throws(()=>session.export(2));session.dispose();assert.equal(session.source,'');assert.equal(session.result,undefined);
});
test('metadata contains labels and line references but no original values',()=>{
 const source='hostname SEED-HOST\npassword SEED-PASSWORD';const session=new ReviewSession();session.load(source,1,scan(source));const metadata=JSON.stringify(session.metadata());assert.ok(!metadata.includes('SEED-HOST'));assert.ok(!metadata.includes('SEED-PASSWORD'));assert.ok(!metadata.includes('start'));assert.ok(!metadata.includes('output'));
});
test('empty files, Unicode, and invalid manual ranges',()=>{assert.equal(redact('').output,'');assert.ok(!redact('description 北京 SEED').output.includes('北京'));assert.throws(()=>manualSpans('abc',[{start:0,end:5}]));});
test('size limit is enforced',()=>assert.throws(()=>scan('x'.repeat(LIMIT+1)),/5 MiB/));
test('large valid input retains line count and repeated labels',()=>{const source='ip address 192.0.2.1 255.255.255.0\n'.repeat(40000);const result=redact(source);assert.ok(source.length>1024*1024);assert.ok(!result.output.includes('192.0.2.1'));assert.equal((result.output.match(/\n/g)||[]).length,40000);assert.equal(result.replacements.length,40000);assert.ok(result.replacements.every(item=>item.label==='<IP_001>'));});
test('save refuses source, existing files, and hardlink destinations',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'redactor-files-')),source=path.join(dir,'source.ios');fs.writeFileSync(source,'ORIGINAL');
 assert.throws(()=>saveCopy(source,source,'REDACTED'));const hard=path.join(dir,'hard.ios');fs.linkSync(source,hard);assert.throws(()=>saveCopy(hard,source,'REDACTED'));
 const destination=path.join(dir,'redacted-config.txt');saveCopy(destination,source,'REDACTED');assert.equal(fs.readFileSync(destination,'utf8'),'REDACTED');assert.equal(fs.readFileSync(source,'utf8'),'ORIGINAL');assert.throws(()=>saveCopy(destination,source,'REDACTED'));
});

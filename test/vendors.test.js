const {test}=require('node:test'),assert=require('node:assert/strict');
const {scan}=require('../dist/scanner'),{replace,manualSpans}=require('../dist/replacements'),{ReviewSession}=require('../dist/session'),{PROFILES}=require('../dist/profiles');
const cases=require('./fixtures/vendor-cases.json');
assert.deepEqual(cases.map(c=>c.profile),PROFILES.map(p=>p.id));
for(const item of cases)for(const mode of ['labels','addresses'])test(item.profile+' removes seeded values: '+mode,()=>{
 const result=replace(item.source,scan(item.source,item.profile),[],{addressMode:mode,key:Buffer.alloc(32,19)});
 assert.deepEqual(result.flags,[],JSON.stringify(result.flags));
 for(const value of item.remove)assert.ok(!result.output.includes(value),value);
 for(const value of item.keep)assert.ok(result.output.includes(value),value);
 assert.ok(!result.output.includes('192.0.2.10'));
 assert.deepEqual(result.output.match(/\r\n|\r|\n/g),item.source.match(/\r\n|\r|\n/g));
});
test('profile change invalidates result and manual masks',()=>{
 const session=new ReviewSession(),item=cases[0];session.load(item.source,1,scan(item.source));session.acknowledge(true);session.export(1);
 session.setProfile('junos-set');assert.equal(session.stale,true);assert.equal(session.result,undefined);assert.equal(session.reviewed,false);assert.throws(()=>session.export(1));assert.equal(session.metadata().profile,'junos-set');
 assert.throws(()=>session.setProfile('unknown'));assert.throws(()=>scan('secret x','unknown'));
});
for(const [profile,source] of [
 ['cisco-ios','set mgt-config users someone phash PRIVATE'],
 ['panos-set','set system login user someone authentication encrypted-password PRIVATE'],
 ['junos-set','set mgt-config users someone phash PRIVATE'],
 ['junos-hierarchical','system { root-authentication { encrypted-password "PRIVATE"; }'],
 ['junos-hierarchical','system { host-name "unterminated; }'],
 ['junos-hierarchical','mgt-config { users { someone { phash PRIVATE; } } }'],
 ['junos-set','set system unknown-api-token PRIVATE'],
 ['panos-set','set mgt-config users someone unknown-secret PRIVATE'],
 ['panos-xml','<!DOCTYPE config [<!ENTITY x SYSTEM "file:///secret">]><config>&x;</config>'],
 ['panos-xml','<config><phash>PRIVATE</config>'],
 ['panos-xml','<config><entry name="one" name="two"/></config>'],
 ['panos-xml','<config><![CDATA[PRIVATE</config>'],
 ['dell-os10','credential-token PRIVATE']
])test('unsupported content blocks export: '+profile+' '+source.slice(0,25),()=>{
 const detected=scan(source,profile);assert.ok(detected.flags.length);
 const session=new ReviewSession();session.setProfile(profile);session.load(source,1,detected);session.acknowledge(true);assert.throws(()=>session.export(1));
 const masked=replace(source,detected,manualSpans(source,[{start:0,end:source.length}]));
 assert.equal(masked.flags.length,0);assert.ok(!masked.output.includes('PRIVATE'));
});
test('XML comments, CDATA and attributes are masked without entity expansion',()=>{
 const source='<config><!-- PRIVATE-COMMENT --><entry name="PRIVATE-NAME"/><key><![CDATA[PRIVATE-KEY]]></key></config>';
 const result=replace(source,scan(source,'panos-xml'));assert.deepEqual(result.flags,[]);assert.ok(!result.output.includes('PRIVATE'));
});

test('PAN-OS separate masks stay visible and attach to their address',()=>{
 for(const [profile,source] of [
 ['panos-set','set deviceconfig system ip-address 192.0.2.10\nset deviceconfig system netmask 255.255.255.0'],
 ['panos-xml','<config><deviceconfig><system><ip-address>192.0.2.10</ip-address><netmask>255.255.255.0</netmask></system></deviceconfig></config>']
 ]) {const detected=scan(source,profile);const spans=detected.spans.filter(s=>s.category==='IP');assert.equal(spans.length,1);assert.equal(spans[0].prefix,24);const result=replace(source,detected,[],{addressMode:'addresses',key:Buffer.alloc(32,19)});assert.equal(result.flags.length,0);assert.ok(result.output.includes('255.255.255.0'));assert.equal(Number(result.replacements.find(r=>r.category==='IP').label.split('.').at(-1)),10);}
});

test('XML credential values take priority over address mapping',()=>{
 const source='<config password="0.0.0.0/0"><phash>0.0.0.0/0</phash><key>192.0.2.1</key></config>';
 const result=replace(source,scan(source,'panos-xml'),[],{addressMode:'addresses',key:Buffer.alloc(32,19)});
 assert.equal(result.flags.length,0);assert.ok(!result.output.includes('0.0.0.0'));assert.ok(!result.output.includes('192.0.2.1'));assert.equal(result.replacements.filter(s=>s.category==='SECRET').length,3);
});
test('XML declarations cannot carry unsupported unmasked values',()=>{
 for(const source of ['<?xml password="PRIVATE"?><config/>','<?xml version="1.0"?><?xml version="1.0"?><config/>'])assert.ok(scan(source,'panos-xml').flags.length);
 assert.equal(scan('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><config/>','panos-xml').flags.length,0);
});

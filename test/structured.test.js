const {test}=require('node:test'),assert=require('node:assert/strict');
const {scan}=require('../dist/scanner'),{replace}=require('../dist/replacements');
const run=(source,profile,mode='addresses')=>replace(source,scan(source,profile),[],{addressMode:mode,key:Buffer.alloc(32,17)});
for(const mode of ['labels','addresses'])test('JSON nested values, arrays, credentials and repeated addresses: '+mode,()=>{
 const source=JSON.stringify({ip:'192.0.2.10/24',nested:['192.0.2.10','2001:db8::15',{apiToken:{value:'192.0.2.10'},password:123456}],label:'PRIVATE',enabled:true,count:3,empty:null});
 const r=run(source,'generic-json',mode);assert.deepEqual(r.flags,[]);
 for(const value of ['192.0.2.10','2001:db8::15','PRIVATE','123456'])assert.ok(!r.output.includes(value));
 assert.ok(r.output.includes('"enabled":true'));assert.ok(r.output.includes('"count":3'));
 const ips=r.replacements.filter(x=>x.category==='IP');assert.equal(ips.length,3);assert.equal(ips[0].label,ips[1].label);assert.equal(ips[0].prefix,24);
 assert.equal(r.replacements.filter(x=>x.category==='SECRET').length,2);
});
test('JSON escaped values, address keys and duplicate fields are covered',()=>{
 const r=run('{"192.0.2.10":"192.0.2.10","password":"one","password":"two","ip":"192\\u002e0.2.10","message":"server 192.0.2.10"}','generic-json');
 assert.deepEqual(r.flags,[]);assert.ok(!r.output.includes('192.0.2.10') && !r.output.includes('192\\u002e'));assert.ok(!r.output.includes('one'));assert.ok(!r.output.includes('two'));
});
for(const source of ['{"ip":"192.0.2.10",}','{/* comment */"x":1}','{"x":','[1,]','[ '.repeat(130)+'0'+']'.repeat(130)])test('JSON rejects invalid or excessive structure '+source.slice(0,20),()=>assert.ok(scan(source,'generic-json').flags.length));
for(const mode of ['labels','addresses'])test('general XML handles namespaces, attributes, roots and sensitive ancestors: '+mode,()=>{
 const source='<n:settings xmlns:n="urn:example" ip="192.0.2.10"><n:ip>192.0.2.10</n:ip><password><value ip="192.0.2.11">192.0.2.12</value></password><!--PRIVATE--><![CDATA[PRIVATE]]></n:settings>';
 const r=run(source,'generic-xml',mode);assert.deepEqual(r.flags,[]);assert.ok(r.output.includes('xmlns:n="urn:example"'));
 for(const value of ['192.0.2.10','192.0.2.11','192.0.2.12','PRIVATE'])assert.ok(!r.output.includes(value));
 const ips=r.replacements.filter(x=>x.category==='IP');assert.equal(ips.length,2);assert.equal(ips[0].label,ips[1].label);
 assert.ok(scan(source,'panos-xml').flags.length);
});
for(const source of ['<!DOCTYPE root><root/>','<root><x></root>','<root/><other/>','<root a="1" a="2"/>','<root><?private secret?></root>','<root><!--a--b--></root>'])test('general XML rejects unsupported input '+source,()=>assert.ok(scan(source,'generic-xml').flags.length));

const assert=require('node:assert/strict');
const {isIP}=require('node:net');
const {parseAddress}=require('../dist/addresses');
const value=text=>parseAddress(text).value;
const private4=text=>{const n=value(text);return n>>24n===10n || n>>20n===2753n || n>>16n===49320n;};
const in4=(text,base,prefix)=>value(text)>>BigInt(32-prefix)===value(base)>>BigInt(32-prefix);
function public4(text) {return !['0.0.0.0/8','10.0.0.0/8','100.64.0.0/10','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12','192.0.0.0/24','192.0.2.0/24','192.88.99.0/24','192.168.0.0/16','198.18.0.0/15','198.51.100.0/24','203.0.113.0/24','224.0.0.0/4','240.0.0.0/4'].some(cidr=>{const [base,prefix]=cidr.split('/');return in4(text,base,Number(prefix));});}
exports.verifyLarge=(source,result,expected,mode)=>{
 assert.equal(result.flags.length,0,'The fixture must permit a reviewed export.');
 for(const secret of expected.secrets)assert.ok(!result.output.includes(secret),'A seeded credential remains.');
 assert.ok(!result.output.includes('SEED-'),'A seeded sensitive marker remains.');
 assert.deepEqual(result.output.match(/\r\n|\r|\n/g),source.match(/\r\n|\r|\n/g));
 const map=new Map(),outputLines=result.output.split(/\r\n|\r|\n/);
 for(const replacement of result.replacements.filter(r=>r.category==='IP')) {
  const original=source.slice(replacement.start,replacement.end);
  const before=source.slice(source.lastIndexOf('\n',replacement.start-1)+1,replacement.start);
  const column=(before.match(/\S+/g)||[]).length;
  assert.equal(outputLines[replacement.line-1].trim().split(/\s+/)[column].split('/')[0],replacement.label,'An output field differs from its planned replacement.');
  if(map.has(original))assert.equal(map.get(original),replacement.label,'Repeated references must match.');
  map.set(original,replacement.label);
 }
 for(const {value:original,kind} of expected.addresses) {
  assert.ok(map.has(original),'An expected address was missed.');const changed=map.get(original);
  assert.notEqual(changed,original);
  if(mode==='labels') {assert.match(changed,/^<IP_\d+>$/);continue;}
  assert.equal(isIP(changed),kind.endsWith('4')?4:6);
  if(kind==='private4')assert.ok(private4(changed));
  if(kind==='public4')assert.ok(public4(changed));
  if(kind==='private6')assert.equal(value(changed)>>121n,126n);
  if(kind==='public6') {assert.equal(value(changed)>>125n,1n);assert.notEqual(value(changed)>>96n,value('2001:db8::')>>96n);}
 }
 if(mode==='addresses') {
  const originals=new Set(expected.addresses.map(a=>value(a.value).toString()+':'+isIP(a.value)));
  const destinations=new Set();
  for(const {value:original} of expected.addresses) {
   const key=value(map.get(original)).toString()+':'+isIP(original);
   assert.ok(!destinations.has(key),'Two source addresses share a replacement.');destinations.add(key);
   assert.ok(!originals.has(key),'A replacement repeats an original address.');
  }
  for(const group of expected.networks) {
   const bits=isIP(group.network)===4?32:128,base=value(map.get(group.network)),sourceBase=value(group.network),shift=BigInt(bits-group.prefix);
   assert.equal(base>>shift<<shift,base,'A network replacement must retain its boundary.');
   for(const member of group.members) {
    const mapped=value(map.get(member));assert.equal(mapped>>shift,base>>shift,'A member left its subnet.');
    assert.equal(mapped-base,value(member)-sourceBase,'A host offset changed.');
   }
  }
  assert.ok(!/<IP_\d+>/.test(result.output));
 }
 for(const mask of ['255.255.255.0','255.255.0.0','0.0.0.255'])assert.equal(result.output.split(mask).length,source.split(mask).length,'A mask changed.');
 for(const prefix of ['/24','/48','/64'])assert.equal(result.output.split(prefix).length,source.split(prefix).length,'A prefix length changed.');
 return {lines:expected.lines,distinctSecrets:expected.secrets.length,distinctAddresses:expected.addresses.length,networkChecks:expected.networks.length};
};

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {scan}=require('../dist/scanner'),{replace}=require('../dist/replacements'),{ReviewSession}=require('../dist/session');
const {verifyLarge}=require('./large-checks');
const source=fs.readFileSync(path.join(__dirname,'fixtures/large-cisco.ios'),'utf8');
const expected=require('./fixtures/large-cisco.expected.json');
for(const mode of ['labels','addresses'])test(`large Cisco fixture exports without seeded secrets: ${mode}`,()=>{
 const session=new ReviewSession();session.load(source,1,scan(source));session.setAddressMode(mode);
 const summary=verifyLarge(source,session.result,expected,mode);assert.ok(summary.lines>1000);
 session.acknowledge(true);assert.equal(session.export(1),session.result.output);assert.equal(session.source,source);session.dispose();
 assert.equal(fs.readFileSync(path.join(__dirname,'fixtures/large-cisco.ios'),'utf8'),source);
});
test('large public and private topology stays consistent across ten mapping keys',()=>{
 const detected=scan(source);
 for(let seed=1;seed<=10;seed++)verifyLarge(source,replace(source,detected,[],{addressMode:'addresses',key:Buffer.alloc(32,seed)}),expected,'addresses');
});

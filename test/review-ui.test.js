const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function panel() {
 const elements=new Map(), handlers=new Map(),sent=[];
 const element=()=>({disabled:false,listeners:{},addEventListener(type,handler){this.listeners[type]=handler;},replaceChildren(){},append(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../media/review.js'),'utf8'),{
  acquireVsCodeApi:()=>({postMessage(message){sent.push(message);}}),
  document:{getElementById:get,createElement:element},
  window:{addEventListener:(type,handler)=>handlers.set(type,handler)}
 });
 return {get,sent,send:message=>handlers.get('message')({data:message})};
}
for(const stale of [false,true])test(`scan button returns after ${stale?'cancelled':'completed'} scan`,()=>{
 const view=panel();view.send({type:'busy'});assert.equal(view.get('scan').disabled,true);
 view.send({type:'state',data:{stale,reviewed:false,canExport:false,replacements:[],flags:[]}});
 assert.equal(view.get('scan').disabled,false);
 assert.equal(view.get('copy').disabled,true);assert.equal(view.get('save').disabled,true);
 assert.equal(view.get('address-mode').disabled,stale);
});

test('device selector requests a scan and disables export immediately',()=>{
 const view=panel();view.send({type:'state',data:{profile:'cisco-ios',stale:false,reviewed:true,canExport:true,replacements:[],flags:[]}});
 view.get('device-profile').value='panos-xml';view.get('device-profile').listeners.change();
 assert.equal(view.sent.at(-1).type,'profile');assert.equal(view.sent.at(-1).profile,'panos-xml');
 for(const id of ['copy','save','compare'])assert.equal(view.get(id).disabled,true);
 view.send({type:'busy'});assert.equal(view.get('device-profile').disabled,true);
});

test('comparison enables exports without a checkbox or confirmation message',()=>{
 const view=panel();
 view.send({type:'state',data:{stale:false,compared:false,canExport:false,replacements:[],flags:[]}});
 assert.equal(view.get('copy').disabled,true);assert.ok(view.get('review-help').textContent.includes('Open the comparison'));
 const ready={stale:false,compared:true,canExport:true,replacements:[],flags:[]};
 view.send({type:'state',data:ready});assert.equal(view.get('copy').disabled,false);assert.equal(view.get('save').disabled,false);
 const restored=panel();restored.send({type:'state',data:ready});assert.equal(restored.get('copy').disabled,false);
 assert.ok(!view.sent.some(message=>message.type==='reviewed'));
 assert.ok(!fs.readFileSync(path.join(__dirname,'../src/view.ts'),'utf8').includes('type="checkbox"'));
 view.send({type:'state',data:{...ready,compared:false,canExport:false}});assert.equal(view.get('copy').disabled,true);
});

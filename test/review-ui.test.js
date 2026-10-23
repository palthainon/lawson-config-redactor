const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function panel() {
 const elements=new Map(), handlers=new Map();
 const element=()=>({disabled:false,addEventListener(){},replaceChildren(){},append(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../media/review.js'),'utf8'),{
  acquireVsCodeApi:()=>({postMessage(){}}),
  document:{getElementById:get,createElement:element},
  window:{addEventListener:(type,handler)=>handlers.set(type,handler)}
 });
 return {get,send:message=>handlers.get('message')({data:message})};
}
for(const stale of [false,true])test(`scan button returns after ${stale?'cancelled':'completed'} scan`,()=>{
 const view=panel();view.send({type:'busy'});assert.equal(view.get('scan').disabled,true);
 view.send({type:'state',data:{stale,reviewed:false,canExport:false,replacements:[],flags:[]}});
 assert.equal(view.get('scan').disabled,false);
 assert.equal(view.get('copy').disabled,true);assert.equal(view.get('save').disabled,true);
 assert.equal(view.get('address-mode').disabled,stale);
});

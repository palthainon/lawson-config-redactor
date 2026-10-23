'use strict';
const api = acquireVsCodeApi();
const $ = id => document.getElementById(id);
let metadata = {stale:true, replacements:[],flags:[]}, compared = false, visibleRows = 200;
const labels = {SECRET:'Credentials',HOST:'Hostnames',DOMAIN:'Domains',USER:'Usernames',IP:'Addresses',MAC:'Hardware addresses',NAME:'Object names',TEXT:'Free text',MANUAL:'Manual selections'};
const send = type => api.postMessage({type});
function node(tag, text) {const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element;}
function draw() {
  $('scan').disabled = false;
  $('state').textContent = metadata.stale ? 'Preview outdated. Scan the current source before export.' : metadata.flags.length ? 'Export blocked. Mask each flagged section.' : 'Preview ready. Review the comparison before export.';
  $('address-mode').value = metadata.addressMode || 'labels'; $('address-mode').disabled=metadata.stale;
  $('totals').replaceChildren();
  const counts = {};
  metadata.replacements.forEach(item => counts[item.category] = (counts[item.category] || 0) + 1);
  for (const [key,count] of Object.entries(counts)) {const card = node('div');card.append(node('strong',String(count)),node('span',labels[key]));$('totals').append(card);}
  $('compare').disabled = metadata.stale; $('reviewed').disabled = metadata.stale || !!metadata.flags.length || !compared;
  $('reviewed').checked = metadata.reviewed === true;
  $('copy').disabled = !metadata.canExport; $('save').disabled = !metadata.canExport;
  $('flag-summary').textContent = metadata.stale ? 'Scan required.' : metadata.flags.length ? `${metadata.flags.length} section(s) block export.` : 'No unsupported sensitive sections were detected.';
  $('flags').replaceChildren();
  for (const flag of metadata.flags) {const row = node('div');row.className='flag';row.append(node('span',`Line ${flag.line}: ${flag.rule}`));const mask=node('button','Mask this section'); mask.addEventListener('click',()=>api.postMessage({type:'maskFlag',index:flag.index}));row.append(mask);$('flags').append(row);}
  $('replacements').replaceChildren();
  for (const item of metadata.replacements.slice(0,visibleRows)) {const row=node('tr');for(const value of [item.line,labels[item.category],item.label,item.rule]) row.append(node('td',String(value)));$('replacements').append(row);}
  $('more').hidden = visibleRows >= metadata.replacements.length;
}
for (const id of ['scan','compare','source','copy','save','website']) $(id).addEventListener('click',()=>send(id));
$('address-mode').addEventListener('change',()=>{compared=false; $('copy').disabled=true;$('save').disabled=true;$('reviewed').disabled=true;api.postMessage({type:'mode',mode:$('address-mode').value});});
$('reviewed').addEventListener('change',()=>api.postMessage({type:'reviewed',value:$('reviewed').checked}));
$('more').addEventListener('click',()=>{visibleRows+=200;draw();});
window.addEventListener('message',event=>{
  const message=event.data;
  if(message.type==='state') {metadata=message.data; if(!metadata.reviewed) compared=false; if(metadata.stale) visibleRows=200;draw();}
  if(message.type==='compared') {compared=true;draw();}
  if(message.type==='busy') {for(const id of ['scan','compare','reviewed','copy','save']) $(id).disabled=true; $('state').textContent='Scanning configuration…';}
});
send('ready');

// Development-only UI harness. It serves synthetic metadata and never exports configuration text.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {ReviewSession}=require('../dist/session'),{scan}=require('../dist/scanner');
const root=path.join(__dirname,'..');let source=fs.readFileSync(path.join(root,'samples/demo.ios'),'utf8');const session=new ReviewSession();session.load(source,1,scan(source));
const sandbox={exports:{},require(name){return name==='vscode'?{Uri:{joinPath:(_root,...parts)=>'/'+parts.join('/')}}:name.startsWith('.')?require(path.join(root,'dist',name)):require(name);}};
vm.runInNewContext(fs.readFileSync(path.join(root,'dist/view.js'),'utf8'),sandbox);
const bridge=`window.acquireVsCodeApi=()=>({postMessage:async message=>{const response=await fetch('/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)});for(const item of await response.json())window.postMessage(item,'*');}});`;
const dark=':root{--vscode-editor-background:#1f2225;--vscode-editor-foreground:#e5e3dd;--vscode-descriptionForeground:#b1b2ad;--vscode-panel-border:#45494d;--vscode-textBlockQuote-background:#302b25;--vscode-button-background:#a8431a;--vscode-button-foreground:#ffffff;--vscode-button-hoverBackground:#c9531a;--vscode-focusBorder:#f2c53d;--vscode-dropdown-background:#292d31;--vscode-dropdown-foreground:#e5e3dd;--vscode-dropdown-border:#777}';
const server=http.createServer((request,response)=>{
 const url=new URL(request.url,'http://127.0.0.1:4179');
 if(url.pathname==='/message' && request.method==='POST'){
  let body='';request.on('data',chunk=>{body+=chunk;if(body.length>4096)request.destroy();});request.on('end',()=>{
   let messages=[];try{const message=JSON.parse(body);if(message.type==='profile'){session.setProfile(message.profile);source=require('../test/fixtures/vendor-cases.json').find(item=>item.profile===message.profile).source;session.load(source,1,scan(source,session.profile));}if(message.type==='scan')session.load(source,1,scan(source,session.profile));if(message.type==='mode')session.setAddressMode(message.mode);if(message.type==='reviewed')session.acknowledge(message.value);messages=[{type:'state',data:session.metadata()}];if(message.type==='compare'||session.reviewed)messages.push({type:'compared'});}catch{messages=[];}
   response.writeHead(200,{'Content-Type':'application/json'});response.end(JSON.stringify(messages));
  });return;
 }
 if(url.pathname==='/bridge.js'){response.writeHead(200,{'Content-Type':'text/javascript'});response.end(bridge);return;}
 if(url.pathname==='/dark.css'){response.writeHead(200,{'Content-Type':'text/css'});response.end(dark);return;}
 const files={'/media/review.css':['media/review.css','text/css'],'/media/review.js':['media/review.js','text/javascript'],'/media/logo.png':['media/logo.png','image/png']};
 if(files[url.pathname]){const [file,type]=files[url.pathname];response.writeHead(200,{'Content-Type':type});response.end(fs.readFileSync(path.join(root,file)));return;}
 if(url.pathname!=='/'){response.writeHead(404);response.end();return;}
 let html=sandbox.exports.render({asWebviewUri:value=>value,cspSource:"'self'"},'/');
 const nonce=/script-src 'nonce-([^']+)'/.exec(html)[1];
 html=html.replace("script-src 'nonce-", "connect-src 'self'; script-src 'nonce-").replace(`<script nonce="${nonce}" src="/media/review.js">`,`<script nonce="${nonce}" src="/bridge.js"></script><script nonce="${nonce}" src="/media/review.js">`);
 if(url.searchParams.get('theme')==='dark')html=html.replace('</head>','<link rel="stylesheet" href="/dark.css"></head>');
 response.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});response.end(html);
});
server.listen(4179,'127.0.0.1',()=>console.log('Synthetic redactor UI: http://127.0.0.1:4179'));

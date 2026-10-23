const vscode=require('vscode');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
exports.run=async()=>{
 const extension=vscode.extensions.getExtension('DerickL.lawson-config-redactor');assert.ok(extension);const api=await extension.activate();
 const document=await vscode.workspace.openTextDocument({content:'hostname CLIENT-A\nip address 192.0.2.1 255.255.255.0\npassword DEMO-SECRET',language:'plaintext'});await vscode.window.showTextDocument(document);const original=document.getText();
 await vscode.commands.executeCommand('lawsonRedactor.preview');assert.ok(api.metadata().replacements.length>=3);assert.equal(api.metadata().stale,false);await api.compare();assert.ok(vscode.window.tabGroups.all.flatMap(group=>group.tabs).some(tab=>tab.input instanceof vscode.TabInputTextDiff));
 await api.dispatch({type:'reviewed',value:true});assert.equal(api.metadata().canExport,true);
 await api.dispatch({type:'mode',mode:'addresses'});assert.equal(api.metadata().addressMode,'addresses');assert.equal(api.metadata().canExport,false);assert.equal(api.metadata().reviewed,false);assert.throws(()=>api.session().export(document.version));await api.dispatch({type:'reviewed',value:true});assert.equal(api.metadata().canExport,false);await api.compare();await api.dispatch({type:'reviewed',value:true});assert.equal(api.metadata().canExport,true);assert.ok(!api.session().export(document.version).includes('192.0.2.1'));
 const clipboard=await vscode.env.clipboard.readText();try{await api.dispatch({type:'copy'});const copied=await vscode.env.clipboard.readText();assert.ok(!copied.includes('DEMO-SECRET'));assert.ok(!copied.includes('192.0.2.1'));assert.ok(!copied.includes('<IP_'));assert.equal(copied,api.session().result.output);}finally{await vscode.env.clipboard.writeText(clipboard);}
 api.setSaveDialog(async()=>undefined);await api.dispatch({type:'save'});assert.equal(document.getText(),original);
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'redactor-export-')),destination=path.join(directory,'review.txt');api.setSaveDialog(async()=>vscode.Uri.file(destination));await api.dispatch({type:'save'});assert.equal(fs.readFileSync(destination,'utf8'),api.session().result.output);
 const editor=await vscode.window.showTextDocument(document,vscode.ViewColumn.One);editor.selection=new vscode.Selection(0,9,0,17);await vscode.commands.executeCommand('lawsonRedactor.selection');assert.equal(document.getText(),original);assert.equal(api.metadata().reviewed,false);
 await api.compare();await api.dispatch({type:'reviewed',value:true});const outdated=path.join(directory,'outdated.txt');api.setSaveDialog(async()=>{const edit=new vscode.WorkspaceEdit();edit.insert(document.uri,new vscode.Position(0,0),'! edited\n');await vscode.workspace.applyEdit(edit);return vscode.Uri.file(outdated);});await api.dispatch({type:'save'});assert.equal(fs.existsSync(outdated),false);assert.equal(api.metadata().stale,true);assert.throws(()=>api.session().export(document.version));api.close();assert.equal(api.metadata(),undefined);
 const sourceFile=path.join(directory,'source.ios');fs.writeFileSync(sourceFile,original);const saved=await vscode.workspace.openTextDocument(vscode.Uri.file(sourceFile));await vscode.window.showTextDocument(saved);await vscode.commands.executeCommand('lawsonRedactor.preview');await api.compare();await api.dispatch({type:'reviewed',value:true});api.setSaveDialog(async()=>vscode.Uri.file(sourceFile));await api.dispatch({type:'save'});assert.equal(fs.readFileSync(sourceFile,'utf8'),original);api.close();

 const largePath=path.join(__dirname,'fixtures/large-cisco.ios'),largeSource=fs.readFileSync(largePath,'utf8'),largeExpected=require('./fixtures/large-cisco.expected.json'),{verifyLarge}=require('./large-checks');
 const largeDocument=await vscode.workspace.openTextDocument(vscode.Uri.file(largePath));await vscode.window.showTextDocument(largeDocument);await vscode.commands.executeCommand('lawsonRedactor.preview');
 const previousClipboard=await vscode.env.clipboard.readText();
 try {
  for(const mode of ['labels','addresses']) {
   await api.dispatch({type:'mode',mode});assert.equal(api.metadata().canExport,false);await api.compare();await api.dispatch({type:'reviewed',value:true});assert.equal(api.metadata().canExport,true);
   const result=api.session().result;verifyLarge(largeSource,result,largeExpected,mode);
   await api.dispatch({type:'copy'});assert.equal(await vscode.env.clipboard.readText(),result.output);
   const largeFile=path.join(directory,`large-${mode}.txt`);api.setSaveDialog(async()=>vscode.Uri.file(largeFile));await api.dispatch({type:'save'});
   verifyLarge(largeSource,{...result,output:fs.readFileSync(largeFile,'utf8')},largeExpected,mode);
   assert.equal(largeDocument.getText(),largeSource);assert.equal(fs.readFileSync(largePath,'utf8'),largeSource);
  }
 } finally {await vscode.env.clipboard.writeText(previousClipboard);api.close();}
 console.log(`Large Cisco editor checks passed: ${largeExpected.lines} lines, ${largeExpected.secrets.length} distinct secrets removed, ${largeExpected.addresses.length} addresses, ${largeExpected.networks.length} subnet checks, both modes, clipboard and saved output, source unchanged.`);

 for(const item of require('./fixtures/vendor-cases.json')) {
  const doc=await vscode.workspace.openTextDocument({content:item.source,language:'plaintext'});await vscode.window.showTextDocument(doc);await vscode.commands.executeCommand('lawsonRedactor.preview');
  await api.dispatch({type:'profile',profile:item.profile});assert.equal(api.metadata().profile,item.profile);assert.equal(api.metadata().canExport,false);
  for(const mode of ['labels','addresses']) {await api.dispatch({type:'mode',mode});await api.compare();await api.dispatch({type:'reviewed',value:true});assert.equal(api.metadata().canExport,true);const output=api.session().export(doc.version);for(const seed of item.remove)assert.ok(!output.includes(seed));}
  await api.dispatch({type:'profile',profile:item.profile==='cisco-ios'?'junos-set':'cisco-ios'});assert.equal(api.metadata().canExport,false);assert.equal(api.metadata().reviewed,false);assert.equal(doc.getText(),item.source);api.close();
 }
 console.log('Eight vendor profiles passed in the editor host with both address modes and profile review reset.');
 console.log('Editor integration passed: activation, address mode changes, review reset, numeric clipboard and file output, unsaved source, review panel, read-only comparison, clipboard, cancelled save, saved export, source overwrite rejection, manual selection, stale preview, and disposal.');
};

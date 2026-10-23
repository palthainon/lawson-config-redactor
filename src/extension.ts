import * as vscode from 'vscode';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {ReviewSession} from './session';
import {LIMIT, Scan} from './types';
import {saveCopy} from './files';
import {render} from './view';
const SCHEME = 'lawson-redactor';
export function activate(context: vscode.ExtensionContext) {
  const documents = new Map<string,string>();
  const provider = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {provideTextDocumentContent(uri) {return documents.get(uri.toString()) || '';}});
  let current: {document: vscode.TextDocument; session: ReviewSession; panel: vscode.WebviewPanel; refresh: () => Promise<void>; publish: () => void; compare: () => Promise<void>; resetComparison: () => void} | undefined;
  let chooseSave: typeof vscode.window.showSaveDialog = options => vscode.window.showSaveDialog(options);
  let dispatch: ((message: {type: string; index?: number; value?: boolean; mode?: unknown}) => Promise<void>) | undefined;
  const cleanViews = async () => {
    documents.clear();
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => (tab.input instanceof vscode.TabInputText && tab.input.uri.scheme === SCHEME) || (tab.input instanceof vscode.TabInputTextDiff && tab.input.original.scheme === SCHEME));
    if (tabs.length) await vscode.window.tabGroups.close(tabs, true);
  };
  async function preview() {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || !['file','untitled'].includes(document.uri.scheme)) {void vscode.window.showInformationMessage('Open a local configuration document first.'); return;}
    current?.panel.dispose();
    await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One,preview:false,preserveFocus:true});
    const session = new ReviewSession(), panel = vscode.window.createWebviewPanel('lawsonRedactor.review','Network Config Redactor',vscode.ViewColumn.Beside,{enableScripts:true,localResourceRoots:[vscode.Uri.joinPath(context.extensionUri,'media')]});
    panel.webview.html = render(panel.webview, context.extensionUri);
    let disposed = false, generation = 0, worker: Worker | undefined, compared = false;
    const publish = () => {void panel.webview.postMessage({type:'state',data:session.metadata()});};
    const compare = async () => {
      if (session.stale || document.version !== session.version || !session.result) throw new Error('Scan the current source first.');
      await cleanViews();
      const id=randomUUID(), original=vscode.Uri.parse(`${SCHEME}:/${id}/original.txt`), redacted=vscode.Uri.parse(`${SCHEME}:/${id}/redacted.txt`);
      documents.set(original.toString(),session.source); documents.set(redacted.toString(),session.result.output);
      await vscode.commands.executeCommand('vscode.diff', original, redacted, 'Original snapshot ↔ Redacted review text', {preview:false,viewColumn:vscode.ViewColumn.One});
      if (!session.stale) {compared=true; void panel.webview.postMessage({type:'compared'});}
    };
    const refresh = async () => {
      const request = ++generation; worker?.terminate(); session.invalidate(); compared=false; publish(); void cleanViews();
      const source=document.getText(), version=document.version;
      if(Buffer.byteLength(source)>LIMIT) {void vscode.window.showErrorMessage('The configuration exceeds the 5 MiB limit.');return;}
      void panel.webview.postMessage({type:'busy'});
      await vscode.window.withProgress({location:vscode.ProgressLocation.Notification,title:'Scan configuration for redaction',cancellable:true}, async (_progress, cancellation) => {
        try {
          const detected = await new Promise<Scan>((resolve,reject)=>{
            const task=new Worker(path.join(__dirname,'worker.js'),{workerData:source});worker=task;
            const subscription=cancellation.onCancellationRequested(()=>{void task.terminate();reject(new Error('Scan cancelled.'));});
            task.once('message',message=>{subscription.dispose(); if(message.error) reject(new Error(message.error));else resolve(message.scan);});
            task.once('error',()=>{subscription.dispose();reject(new Error('The scan could not finish.'));});
            task.once('exit',code=>{subscription.dispose();if(code!==0)reject(new Error('Scan cancelled.'));});
          });
          if(disposed || request!==generation || version!==document.version || cancellation.isCancellationRequested) return;
          session.load(source,version,detected); publish();
        } catch {if(!disposed && request===generation) {session.invalidate();publish();void vscode.window.showInformationMessage('The scan did not complete. Scan the source again.');}}
      });
    };
    current={document,session,panel,refresh,publish,compare,resetComparison:()=>{compared=false;}};
    const changed=vscode.workspace.onDidChangeTextDocument(event=>{if(event.document===document){generation++;void worker?.terminate();session.invalidate();compared=false;publish();void cleanViews();}});
    const closed=vscode.workspace.onDidCloseTextDocument(doc=>{if(doc===document)panel.dispose();});
    const handleMessage = async (message: {type: string; index?: number; value?: boolean; mode?: unknown})=>{
      if(disposed) return;
      try {
        switch(message?.type) {
          case 'ready': publish(); break;
          case 'scan': await refresh(); break;
          case 'compare': await compare(); break;
          case 'source': await vscode.window.showTextDocument(document,{viewColumn:vscode.ViewColumn.One});break;
          case 'maskFlag': {
            if(session.stale || document.version!==session.version || !Number.isInteger(message.index)) throw new Error('Scan the current source first.');
            const flag=session.result?.flags[message.index!];if(!flag) return;session.mask(flag.start,flag.end);compared=false;await cleanViews();publish();break;
          }
          case 'mode': session.setAddressMode(message.mode);compared=false;await cleanViews();publish();break;
          case 'reviewed': session.acknowledge(compared && message.value===true);publish();if(compared)void panel.webview.postMessage({type:'compared'});break;
          case 'copy': {const output=session.export(document.version);await vscode.env.clipboard.writeText(output);void vscode.window.showInformationMessage('Redacted review text copied.');break;}
          case 'save': {
            session.export(document.version);
            const defaultUri=document.uri.scheme==='file'?vscode.Uri.file(path.join(path.dirname(document.uri.fsPath),'redacted-config.txt')):undefined;
            const destination=await chooseSave({defaultUri,saveLabel:'Save redacted copy',filters:{'Review text':['txt']}});
            if(!destination) return;if(destination.scheme!=='file') throw new Error('Choose a local file.');
            const output=session.export(document.version);saveCopy(destination.fsPath,document.uri.scheme==='file'?document.uri.fsPath:undefined,output);
            void vscode.window.showInformationMessage('Redacted review copy saved.');break;
          }
          case 'website': await vscode.env.openExternal(vscode.Uri.parse('https://lawsoncyber.com'));break;
        }
      } catch(error) {void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'The review action could not complete.');}
    };
    dispatch=handleMessage;
    const messages=panel.webview.onDidReceiveMessage(handleMessage);
    panel.onDidDispose(()=>{disposed=true;generation++;void worker?.terminate();session.dispose();changed.dispose();closed.dispose();messages.dispose();void cleanViews();if(current?.panel===panel){current=undefined;dispatch=undefined;}});
    await refresh();
  }
  const selection=async()=>{
    if(!current) {void vscode.window.showInformationMessage('Open a redaction preview first.');return;}
    const editor=vscode.window.activeTextEditor;
    if(!editor || editor.document!==current.document || editor.selection.isEmpty) {void vscode.window.showInformationMessage('Select text in the original source document.');return;}
    try {if(current.document.version!==current.session.version) throw new Error('Scan the current source first.');current.session.mask(editor.document.offsetAt(editor.selection.start),editor.document.offsetAt(editor.selection.end));current.resetComparison();await cleanViews();current.publish();current.panel.reveal(vscode.ViewColumn.Beside,true);} catch {void vscode.window.showErrorMessage('Select source text in a current redaction review.');}
  };
  context.subscriptions.push(provider,{dispose(){current?.panel.dispose();documents.clear();}},vscode.commands.registerCommand('lawsonRedactor.preview',preview),vscode.commands.registerCommand('lawsonRedactor.selection',selection),vscode.commands.registerCommand('lawsonRedactor.demo',async()=>{await vscode.window.showTextDocument(vscode.Uri.joinPath(context.extensionUri,'samples','demo.ios'));await preview();}));
  // Test hooks contain no source values and exist only in the extension development host.
  return context.extensionMode!==vscode.ExtensionMode.Production ? {metadata:()=>current?.session.metadata(),compare:()=>current?.compare(),session:()=>current?.session,close:()=>current?.panel.dispose(),dispatch:(message:{type:string;index?:number;value?:boolean;mode?:unknown})=>dispatch?.(message),setSaveDialog:(dialog:typeof vscode.window.showSaveDialog)=>{chooseSave=dialog;}} : undefined;
}

const {spawnSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {downloadAndUnzipVSCode}=require('@vscode/test-electron');
(async()=>{
 const root=path.join(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'lawson-redactor-host-'));const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const executable=await downloadAndUnzipVSCode({version:'1.102.0',cachePath:path.join(root,'.vscode-test'),timeout:30000});
 const result=spawnSync(executable,['--disable-gpu','--skip-welcome','--skip-release-notes','--disable-workspace-trust','--disable-extensions','--user-data-dir='+profile,'--extensions-dir='+path.join(profile,'extensions'),'--extensionDevelopmentPath='+root,'--extensionTestsPath='+path.join(root,'test','host.js')],{env,encoding:'utf8',timeout:90000,windowsHide:true});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error)console.error(result.error.message);process.exitCode=result.status??1;
})().catch(error=>{console.error(error.message);process.exitCode=1;});

// Release checks run outside the extension. They never read configuration input.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const local=process.argv.includes('--local');
function requireCheck(condition,message){if(!condition)throw new Error(message);}
function imageSize(file){
 const data=fs.readFileSync(file);
 if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
 if(data[0]===255&&data[1]===216){let pos=2;while(pos<data.length-9){requireCheck(data[pos]===255,'Invalid JPEG marker.');while(data[pos]===255)pos++;const marker=data[pos++];if(marker===216||marker===217)continue;const length=data.readUInt16BE(pos);requireCheck(length>=2,'Invalid JPEG segment.');if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:data.readUInt16BE(pos+5),height:data.readUInt16BE(pos+3)};pos+=length;}}
 throw new Error('Use PNG or JPEG artwork.');
}
(async()=>{
 requireCheck(manifest.name==='lawson-config-redactor' && manifest.publisher==='DerickL','Keep the selected extension identity.');
 requireCheck(manifest.displayName==='Network Config Redactor \u2014 Lawson Cyber LLC','Keep the company listing name free of encoding errors.');
 requireCheck(manifest.license==='MIT','Select the approved MIT license.');
 const license=fs.readFileSync(path.join(root,'LICENSE'),'utf8');requireCheck(license.includes('MIT License')&&license.includes('2026 Lawson Cyber LLC'),'Include the company MIT license.');
 requireCheck(JSON.stringify(manifest.extensionKind)==='["ui"]','Run the extension in the local desktop host.');
 requireCheck(!manifest.browser && !Object.keys(manifest.dependencies||{}).length,'Review any browser entry point or runtime dependency before release.');
 requireCheck(manifest.preview===true,'Keep the first release marked Preview.');
 requireCheck(manifest.galleryBanner?.color==='#3a2414','Keep the selected company banner color.');
 const logo=imageSize(path.join(root,manifest.icon));requireCheck(logo.width>=128&&logo.height>=128,'The icon must be at least 128 by 128 pixels.');
 const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
 const images=[...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(match=>match[1]);requireCheck(images.length>=2,'Include both address-mode screenshots.');
 for(const image of images){requireCheck(!/^(?:https?:|data:)/.test(image),'Keep source screenshots in the local repository.');const relative=path.relative(root,path.resolve(root,image));requireCheck(!relative.startsWith('..')&&!path.isAbsolute(relative),'Keep screenshots inside the repository.');const size=imageSize(path.join(root,image));requireCheck(size.width>=1000&&size.height>=600,'Use a readable editor screenshot.');}
 for(const file of ['PRIVACY.md','SUPPORT.md','CHANGELOG.md'])requireCheck(fs.existsSync(path.join(root,file)),`Include ${file}.`);
 if(local){console.log(JSON.stringify({localChecks:'passed',icon:logo,screenshots:images.length,marketplaceUploadReady:false,pending:'Run the public screenshot checks before building the upload package.'},null,2));return;}
 const base=manifest.vsce?.baseImagesUrl;
 requireCheck(typeof base==='string'&&base.startsWith('https://'),'Public HTTPS screenshot hosting is not configured. The local preview is not an upload package.');
 for(const image of images){const url=new URL(image,base.endsWith('/')?base:base+'/');const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(15000)});requireCheck(response.ok&&response.headers.get('content-type')?.includes('image/'),`Screenshot hosting check failed: ${url.href}`);const remote=Buffer.from(await response.arrayBuffer()),expected=fs.readFileSync(path.join(root,image));requireCheck(createHash('sha256').update(remote).digest('hex')===createHash('sha256').update(expected).digest('hex'),`The hosted screenshot differs from the local asset: ${url.href}`);}
 console.log('Marketplace metadata and public screenshot checks passed. Publisher access and publication approval remain separate.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});

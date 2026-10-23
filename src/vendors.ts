import {isIP} from 'node:net';
import {Category, Scan, Span} from './types';
import {DeviceProfile} from './profiles';
import {linesOf} from './cisco';
interface Token {value:string; start:number; end:number}
const sensitive = /(?:password|secret|community|passphrase|private-key|shared-key|authentication-key|privacy-key|key-string|phash|api-key|token)/i;
const secretFields = new Set(['password','encrypted-password','plain-text-password','secret','community','phash','private-key','public-key','certificate','passphrase','api-key','auth-password','priv-password','snmp-community','authpwd','privpwd','bind-password','shared-secret','authentication-key','privacy-key','privacy-password','key-string','ssh-rsa','ssh-dsa','ssh-ecdsa','ssh-ed25519']);
const names = new Set(['users','user','address-group','address-set','policy-statement','prefix-list','routing-instances','groups','group','zone','security-zone','zones','rules','rule','gateway','ike-gateway','virtual-router','virtual-wire','template','device-group','authentication-profile','certificate-profile','profile-group','filter','policy','proposal','key-chain']);
function maskPrefix(value:string):number|undefined {if(isIP(value)!==4)return;const bits=value.split('.').map(n=>Number(n).toString(2).padStart(8,'0')).join('');if(/^1*0*$/.test(bits))return bits.indexOf('0')<0?32:bits.indexOf('0');}
const textFields = new Set(['description','full-name','contact','location','login-banner','message','comments','comment']);
function add(result:Scan,start:number,end:number,category:Category,rule:string,priority=40,prefix?:number) {
  if(end>start) result.spans.push({start,end,category,rule,priority,...(prefix===undefined?{}:{prefix})});
}
function block(result:Scan,source:string,rule:string) {result.flags.push({start:0,end:source.length,rule});}
function address(result:Scan,t:Token):boolean {
  const parts=t.value.split('/'),family=isIP(parts[0]);
  if(!family || parts.length>2) return false;
  let prefix:number|undefined;
  if(parts.length===2) {
    prefix=/^\d+$/.test(parts[1])?Number(parts[1]):-1;
    if(prefix<0 || prefix>(family===4?32:128)) {result.flags.push({start:t.start,end:t.end,rule:'Invalid address prefix. Mask this value.'});return true;}
  }
  add(result,t.start,t.start+parts[0].length,'IP','Network address',40,prefix);return true;
}
function lex(source:string,result:Scan):Token[] {
  const tokens:Token[]=[];let at=0;
  while(at<source.length) {
    if(/\s/.test(source[at])) {at++;continue;}
    const start=at;
    if(source.startsWith('/*',at)) {
      const close=source.indexOf('*/',at+2);
      if(close<0) {block(result,source,'Unclosed comment. Mask the configuration.');break;}
      add(result,at+2,close,'TEXT','Comment',80);at=close+2;continue;
    }
    if(source[at]==='#') {
      while(at<source.length && !/[\r\n]/.test(source[at]))at++;
      add(result,start+1,at,'TEXT','Comment',80);continue;
    }
    if(source[at]==='"' || source[at]==="'") {
      const quote=source[at++],valueStart=at;
      while(at<source.length && source[at]!==quote) {if(source[at]==='\\')at++;at++;}
      if(at>=source.length) {block(result,source,'Unclosed quoted value. Mask the configuration.');break;}
      tokens.push({value:source.slice(valueStart,at),start:valueStart,end:at});at++;continue;
    }
    if('{};[]'.includes(source[at])) {tokens.push({value:source[at],start:at,end:++at});continue;}
    while(at<source.length && !/[\s{};\[\]"']/.test(source[at]))at++;
    tokens.push({value:source.slice(start,at),start,end:at});
  }
  return tokens;
}
export function scanCli(source:string,profile:DeviceProfile):Scan {
  const result:Scan={spans:[],flags:[]},tokens=lex(source,result),declared=new Map<string,Category>(),handled=new Set<number>(),masks=new Map<string,number>(),maskedAddresses:{span:Span;scope:string}[]=[];
  const mark=(t:Token|undefined,category:Category,rule:string,priority=60)=>{
    if(t && !['[',']','{','}',';'].includes(t.value)){add(result,t.start,t.end,category,rule,priority);if(priority>=80)handled.add(t.start);}
  };
  const declare=(t:Token|undefined,category:Category)=>{
    if(!t || /^\d+$/.test(t.value))return;
    if(names.has(t.value) || secretFields.has(t.value) || ['system','interfaces','security','set','permit','deny'].includes(t.value)) {
      block(result,source,'An identifier conflicts with a command keyword. Mask the configuration.');return;
    }
    declared.set(t.value,category);mark(t,category,'Configured name',50);
  };
  const process=(statement:Token[],ancestors:Token[],opening=false)=>{
    const path=[...ancestors,...statement],words=path.map(t=>t.value.toLowerCase());
    for(let i=0;i<path.length;i++) {
      const t=path[i],word=words[i],next=path[i+1];
      if(handled.has(t.start))continue;
      if(['host-name','hostname'].includes(word))declare(next,'HOST');
      if(['domain-name','domain'].includes(word))declare(next,'DOMAIN');
      if(names.has(word))declare(next,['user','users'].includes(word)?'USER':'NAME');
      // Junos communities and PAN-OS named address objects are values in the path.
      if(word==='community' && words.includes('snmp')) mark(next,'SECRET','SNMP community',100);
      if(word==='address' && profile==='panos-set' && !words.includes('interface'))declare(next,'NAME');
      if((word==='privacy-key' || word==='privacy-password') &&
          (opening || !next || i+2!==path.length || ['{','}',';','[',']'].includes(next.value))) {
        block(result,source,'A privacy credential requires one scalar value. Mask the configuration.');continue;
      }
      if(secretFields.has(word) || (word==='key' && words.some(w=>/radius|tacacs|tacplus|authentication|pre-shared-key|auth-key/.test(w)))) {
        if(next && !['{','}',';','[',']'].includes(next.value))mark(next,'SECRET','Credential or key',100);
        else if(!opening && !ancestors.includes(t)) block(result,source,'A sensitive field has no supported value. Mask the configuration.');
      } else if(word==='pre-shared-key') {
        const offset=['ascii-text','hexadecimal','key'].includes(next?.value)?2:1;
        if(path[i+offset])mark(path[i+offset],'SECRET','Shared key',100);
        else if(!opening && !ancestors.includes(t))block(result,source,'A shared key has no supported value. Mask the configuration.');
      } else if(sensitive.test(word) && !['root-authentication','password-complexity','password-profile','authentication-key-chain','authentication-method','pre-shared-keys','no-password','no-public-keys'].includes(word) && !ancestors.includes(t)) {
        result.flags.push({start:statement[0].start,end:statement.at(-1)!.end,rule:'Unrecognized sensitive field. Mask this statement.'});
      }
      if(textFields.has(word)) {
        const rest=path.slice(i+1).filter(item=>statement.includes(item));
        for(const value of rest)mark(value,'TEXT','Free text',80);
      }
    }
    for(let index=0;index<statement.length;index++) {
      const t=statement[index],previous=statement[index-1]?.value;
      if(previous==='netmask') {const prefix=maskPrefix(t.value);if(prefix===undefined)result.flags.push({start:t.start,end:t.end,rule:'Invalid netmask. Mask this value.'});else masks.set(statement.slice(0,index-1).map(v=>v.value).join(' '),prefix);continue;}
      const before=result.spans.length;
      const found=address(result,t);
      if(found && previous==='ip-address' && result.spans.length>before)maskedAddresses.push({span:result.spans.at(-1)!,scope:statement.slice(0,index-1).map(v=>v.value).join(' ')});
      if(!found && /^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(t.value))mark(t,'MAC','Hardware address');
    }
  };
  if(profile==='junos-hierarchical') {
    const stack:Token[][]=[];let pending:Token[]=[];
    for(const token of tokens) {
      if(token.value==='{') {
        if(!pending.length){block(result,source,'Unexpected opening brace. Mask the configuration.');break;}
        if(!stack.length && !['system','interfaces','security','snmp','protocols','routing-options','routing-instances','policy-options','firewall','groups','chassis','class-of-service','vlans','forwarding-options','access','applications','services','event-options','logical-systems'].includes(pending[0].value))block(result,source,'Unknown Junos hierarchy. Check the selected profile.');
        process(pending,stack.flat(),true);stack.push(pending);pending=[];
        if(stack.length>128){block(result,source,'Configuration nesting exceeds 128 levels.');break;}
      } else if(token.value==='}') {
        if(pending.length || !stack.length) {block(result,source,'Missing semicolon or unmatched closing brace.');break;}
        stack.pop();
      } else if(token.value===';') {if(pending.length)process(pending,stack.flat());pending=[];}
      else pending.push(token);
    }
    if(pending.length || stack.length)block(result,source,'Incomplete hierarchy. Mask the configuration.');
    if(tokens.length && !tokens.some(t=>t.value==='{'))block(result,source,'Select the Junos set profile for set commands.');
  } else {
    let cursor=0;
    for(const line of linesOf(source)) {
      const statement:Token[]=[];
      while(cursor<tokens.length && tokens[cursor].start<line.end)statement.push(tokens[cursor++]);
      if(!statement.length)continue;
      if(statement[0].value!=='set' || statement.some(t=>['{','}',';'].includes(t.value))) {
        result.flags.push({start:line.start,end:line.end,rule:'This profile requires one complete set command per line.'});continue;
      }
      const top=statement[1]?.value;
      const valid=profile==='panos-set'?['deviceconfig','mgt-config','network','shared','vsys','rulebase','template','template-stack','device-group','devices','readonly']:['system','interfaces','security','snmp','protocols','routing-options','routing-instances','policy-options','firewall','groups','chassis','class-of-service','vlans','forwarding-options','ethernet-switching-options','access','applications','services','event-options','logical-systems','apply-groups','version'];
      if(!top || !valid.includes(top)) {result.flags.push({start:line.start,end:line.end,rule:'Unknown set hierarchy. Check the vendor profile or mask this line.'});continue;}
      process(statement,[]);
    }
  }
  for(const item of maskedAddresses) {const prefix=masks.get(item.scope);if(prefix!==undefined)item.span.prefix=prefix;}
  for(const token of tokens) {const category=declared.get(token.value);if(category)mark(token,category,'Configured name reference',50);}
  return result;
}
export function scanDell(source:string,profile:DeviceProfile,result:Scan):Scan {
  const secret = profile==='dell-os9'?'sha256-password':'password';
  for(const line of linesOf(source)) {
    const match=new RegExp('\\b'+secret+'\\s+(?:level\\s+\\d+\\s+)?(?:(?:0|5|7|9)\\s+)?(.+)$','i').exec(line.text);
    if(match){add(result,line.start+match.index+match[0].length-match[1].length,line.end,'SECRET','Dell credential',100);if(secret==='sha256-password')result.flags=result.flags.filter(flag=>!(flag.start===line.start && flag.rule==='Unrecognized sensitive command'));}
    const key=/^\s*key\s+(?:(?:0|7|9)\s+)?(.+)$/i.exec(line.text);
    if(key) {
      add(result,line.start+key.index+key[0].length-key[1].length,line.end,'SECRET','Dell authentication key',100);
      result.flags=result.flags.filter(flag=>!(flag.start===line.start && flag.rule==='Unrecognized key command'));
    }
    const unknown=/\b(?:passphrase|private-key|api-key|token|credential|sha256-password)\b/i.test(line.text);
    if(unknown && !match)result.flags.push({start:line.start,end:line.end,rule:'Unrecognized Dell sensitive field. Mask this line.'});
  }
  return result;
}
export function scanXml(source:string):Scan {
  const result:Scan={spans:[],flags:[]},stack:string[]=[],ids:number[]=[];
  const masks=new Map<number,number>(),maskedAddresses:{span:Span;scope:number}[]=[];let nextId=0;
  const fail=()=>block(result,source,'Unsupported or malformed PAN-OS XML. Mask the configuration or use set commands.');
  if(/<!DOCTYPE|<!ENTITY/i.test(source)) {fail();return result;}
  let at=0,roots=0,declaration=false;
  while(at<source.length) {
    if(source.startsWith('<!--',at)) {
      const end=source.indexOf('-->',at+4);if(end<0){fail();break;}
      add(result,at+4,end,'TEXT','XML comment',80);at=end+3;continue;
    }
    if(source.startsWith('<![CDATA[',at)) {
      const end=source.indexOf(']]>',at+9);if(end<0 || !stack.length){fail();break;}
      add(result,at+9,end,'SECRET','Opaque XML content',100);at=end+3;continue;
    }
    if(source.startsWith('<?xml ',at) && roots===0) {
      const end=source.indexOf('?>',at+6);
      if(end<0 || declaration || !/^<\?xml\s+version=(?:"1\.[01]"|'1\.[01]')(?:\s+encoding=(?:"[A-Za-z][\w.-]*"|'[A-Za-z][\w.-]*'))?(?:\s+standalone=(?:"(?:yes|no)"|'(?:yes|no)'))?\s*\?>$/.test(source.slice(at,end+2))){fail();break;}
      declaration=true;at=end+2;continue;
    }
    if(source[at]==='<') {
      const match=/^<(\/?)([A-Za-z_][\w.-]*)((?:\s+[A-Za-z_][\w.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(source.slice(at));
      if(!match){fail();break;}
      const [,closing,tag,attributes='',selfClosing]=match;
      if(closing) {
        if(attributes.trim() || selfClosing || stack.pop()!==tag){fail();break;}ids.pop();
      } else {
        if(!stack.length) {roots++;if(!['config','response'].includes(tag) || roots>1){fail();break;}}
        const attr=/\s+([A-Za-z_][\w.-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
        let position=0,item:RegExpExecArray|null;const seen=new Set<string>();
        while(position<attributes.length) {
          if(!attributes.slice(position).trim())break;
          attr.lastIndex=position;item=attr.exec(attributes);
          if(!item || seen.has(item[1])){fail();return result;}
          seen.add(item[1]);position=attr.lastIndex;
          const valueStart=at+1+tag.length+item.index+item[0].lastIndexOf(item[2])+1;
          const value=item[2].slice(1,-1);
          if(sensitive.test(item[1]))add(result,valueStart,valueStart+value.length,'SECRET','XML credential attribute',100);
          else if(!address(result,{value,start:valueStart,end:valueStart+value.length}))add(result,valueStart,valueStart+value.length,'NAME','XML attribute',60);
        }
        if(!selfClosing){stack.push(tag);ids.push(++nextId);}
        if(stack.length>128){fail();break;}
      }
      at+=match[0].length;continue;
    }
    const end=source.indexOf('<',at),stop=end<0?source.length:end;
    const raw=source.slice(at,stop),value=raw.trim();
    if(value) {
      if(!stack.length){fail();break;}
      const start=at+raw.indexOf(value),tag=stack.at(-1)!;
      if(sensitive.test(tag) || tag==='key')add(result,start,start+value.length,'SECRET','XML credential',100);
      else if(tag==='netmask' && isIP(value)===4) {
        // Retain only a valid contiguous netmask.
        const bits=value.split('.').map(n=>Number(n).toString(2).padStart(8,'0')).join('');
        if(!/^1*0*$/.test(bits))result.flags.push({start,end:start+value.length,rule:'Invalid XML netmask. Mask this value.'});
        else masks.set(ids.at(-2)!,maskPrefix(value)!);
      } else {
        const before=result.spans.length,found=address(result,{value,start,end:start+value.length});
        if(found && tag==='ip-address' && result.spans.length>before)maskedAddresses.push({span:result.spans.at(-1)!,scope:ids.at(-2)!});
        if(!found) {
        const category:Category=sensitive.test(tag)||tag==='key'?'SECRET':tag==='hostname'?'HOST':tag==='domain'?'DOMAIN':'NAME';
        add(result,start,start+value.length,category,'XML value',60);
        }
      }
    }
    at=stop;
  }
  for(const item of maskedAddresses){const prefix=masks.get(item.scope);if(prefix!==undefined)item.span.prefix=prefix;}
  if(stack.length || roots!==1)fail();
  return result;
}

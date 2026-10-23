import {isIP} from 'node:net';
import {Category, Flag, LIMIT, Scan, Span} from './types';
interface Token {value: string; start: number; end: number}
interface Line {text: string; start: number; end: number}
export function linesOf(source: string): Line[] {
  const result: Line[] = [];
  const re = /[^\r\n]*(?:\r\n|\r|\n|$)/g;
  for (const match of source.matchAll(re)) if (match[0]) {
    const body = match[0].replace(/[\r\n]+$/, ''); result.push({text: body, start: match.index!, end: match.index! + body.length});
  }
  return result;
}
function tokens(line: Line): Token[] {
  return [...line.text.matchAll(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+/g)].map(match => ({value: match[0], start: line.start + match.index!, end: line.start + match.index! + match[0].length}));
}
export function scan(source: string): Scan {
  if (Buffer.byteLength(source) > LIMIT) throw new Error('The configuration exceeds the 5 MiB limit.');
  const spans: Span[] = [], flags: Flag[] = [], lines = linesOf(source);
  const declared = new Map<string, Category>();
  const add = (start: number, end: number, category: Category, rule: string, priority = 30) => {if (end > start) spans.push({start, end, category, rule, priority});};
  const token = (t: Token | undefined, category: Category, rule: string, priority = 30) => {if (t) add(t.start, t.end, category, rule, priority);};
  const reservedWords = new Set('ip ipv6 interface route-map policy-map class-map access-list access-group prefix-list vrf permit deny match address hostname username secret password domain name forwarding router redistribute static type inspect all any key chain'.split(' '));
  const declare = (t: Token | undefined, category: Category, rule: string) => {if (t && !/^\d+$/.test(t.value)) {
    if(reservedWords.has(t.value)) {flags.push({start:0,end:source.length,rule:'An identifier conflicts with a command keyword. Mask the affected configuration manually.'});return;}
    declared.set(t.value, category); token(t, category, rule);
  }};
  const lineNumbers = new Map(lines.map((line,index)=>[line.start,index]));
  const flag = (line: Line, rule: string) => {
    let end=line.end; const indent=line.text.match(/^\s*/)?.[0].length || 0;
    for(let i=(lineNumbers.get(line.start) || 0)+1;i<lines.length;i++) {
      if(!lines[i].text.trim()) {end=lines[i].end;continue;}
      if((lines[i].text.match(/^\s*/)?.[0].length || 0)<=indent) break;
      end=lines[i].end;
    }
    flags.push({start:line.start,end,rule});
  };
  let serverContext = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]; let t = tokens(line);
    if(t[0]?.value.toLowerCase()==='no') t=t.slice(1);
    const w = t.map(x => x.value.toLowerCase()), head = w[0];
    if (!t.length) continue;
    // Banner content is opaque. A displayed control delimiter such as ^C is one delimiter.
    const banner = /^(\s*banner\s+\S+\s+)(\^.|[^\s])/.exec(line.text);
    if (banner) {
      const start = line.start + banner[0].length, delimiter = banner[2];
      const close = source.indexOf(delimiter, start);
      if (close < 0) {flags.push({start: line.start, end: source.length, rule: 'Unclosed banner'}); break;}
      add(start, close, 'TEXT', 'Banner content', 80);
      while (li + 1 < lines.length && lines[li + 1].start < close + delimiter.length) li++;
      continue;
    }
    if (head === 'banner') {flags.push({start:line.start,end:source.length,rule:'Unknown banner delimiter'}); break;}
    // Mask encoded key bodies and certificates as opaque regions, never as command text.
    const pem = /-----BEGIN ([A-Z0-9 ]*(?:KEY|CERTIFICATE))-----/.exec(line.text);
    if (pem) {
      const endMarker = `-----END ${pem[1]}-----`, close = source.indexOf(endMarker, line.end);
      if (close < 0) {flags.push({start: line.start, end: source.length, rule: 'Unclosed key or certificate block'}); break;}
      add(line.end, close, 'SECRET', 'Encoded key or certificate body', 100);
      while (li + 1 < lines.length && lines[li + 1].start < close + endMarker.length) li++;
      continue;
    }
    if (w.slice(0, 4).join(' ') === 'crypto pki certificate chain') {
      declare(t[4], 'NAME', 'Certificate chain name');
      let end = li + 1;
      while (end < lines.length && (lines[end].text === '' || /^\s/.test(lines[end].text) || /^quit\s*$/i.test(lines[end].text))) end++;
      if (end === lines.length) {flags.push({start: line.start, end: source.length, rule: 'Certificate block needs a boundary'}); break;}
      for(let i=li+1;i<end;i++) {
        const body=lines[i], parts=tokens(body);
        if(!parts.length || /^quit\s*$/i.test(body.text.trim()))continue;
        if(parts[0].value.toLowerCase()==='certificate') {if(parts[2])add(parts[2].start,body.end,'SECRET','Certificate identifier',100);}
        else add(body.start+(body.text.match(/^\s*/)?.[0].length || 0),body.end,'SECRET','Certificate body',100);
      }
      li = end - 1; continue;
    }
    if (!/^\s/.test(line.text) || head === '!') serverContext = /^(?:radius|tacacs) server\s/i.test(line.text);
    if (head === 'hostname') declare(t[1], 'HOST', 'Hostname');
    if (w[0] === 'ip' && (w[1]==='domain-name' || (w[1]==='domain' && w[2]==='name'))) {
      const index = w[1] === 'domain' ? 3 : 2; declare(t[index], 'DOMAIN', 'Domain name');
    }
    if(['radius','tacacs'].includes(head) && w[1]==='server') declare(t[2],'NAME','Authentication server name');
    if (head === 'username') declare(t[1], 'USER', 'Local username');
    if (head === 'ppp' && w[1] === 'chap' && w[2] === 'hostname') declare(t[3], 'USER', 'PPP username');
    const sentUser = w.indexOf('sent-username'); if (head === 'ppp' && sentUser >= 0) declare(t[sentUser+1], 'USER', 'PPP username');
    if (head === 'ip' && w[1] === 'access-list') declare(t[3], 'NAME', 'Access list name');
    if (head === 'ipv6' && w[1] === 'access-list') declare(t[2], 'NAME', 'Access list name');
    if (head === 'access-list') declare(t[1], 'NAME', 'Access list name');
    if (['route-map', 'policy-map', 'key', 'class-map'].includes(head)) {
      const index = head==='class-map' ? (w[1]==='type' ? (['match-any','match-all'].includes(w[3]) ? 4 : 3) : ['match-any','match-all'].includes(w[1]) ? 2 : 1) : head==='policy-map' && w[1]==='type' ? 3 : 1;
      if (head !== 'key' || w[1] === 'chain') declare(t[head === 'key' ? 2 : index], 'NAME', 'Configuration object name');
    }
    if (['ip', 'ipv6'].includes(head) && w[1] === 'prefix-list') declare(t[2], 'NAME', 'Prefix list name');
    if (head === 'vrf' && ['definition','context'].includes(w[1])) declare(t[2], 'NAME', 'Routing instance name');
    if (head === 'ip' && w[1] === 'vrf' && !['forwarding','receive','select','autoclassify'].includes(w[2])) declare(t[2], 'NAME', 'Routing instance name');
    const free = /^(\s*(?:description|remark|system message|snmp-server (?:contact|location))\s+)(.*)$/i.exec(line.text);
    const comment = /^(\s*!\s*)(.+)$/.exec(line.text);
    if (free || comment) {const match = (free || comment)!; add(line.start + match[1].length, line.end, 'TEXT', 'Free text', 70); continue;}
    const secretTail = (index: number, rule: string) => {
      if (w[index] === 'level' && /^\d+$/.test(w[index + 1] || '')) index += 2;
      if (/^(?:0|4|5|6|7|8|9)$/.test(w[index] || '')) index++;
      else if (/^\d+$/.test(w[index] || '') && t[index+1]) flag(line,'Unknown credential encoding type');
      if (!t[index]) {flag(line, 'Missing or unknown credential value'); return;}
      add(t[index].start, line.end, 'SECRET', rule, 100);
    };
    let credentialHandled = false;
    if (head !== 'no') {
      if (head === 'snmp-server' && w[1] === 'community') {token(t[2], 'SECRET', 'SNMP community', 100); credentialHandled = !!t[2];}
      else if(head==='snmp-server' && w[1]==='host') {
        const version=w.indexOf('version',3);let value=version<0?3:version+2;
        if(version<0 && ['traps','informs'].includes(w[value]))value++;
        if(version>=0 && w[version+1]==='3') {
          if(['auth','noauth','priv'].includes(w[value]))value++;
          if(t[value])declare(t[value],'USER','SNMP destination username');else flag(line,'Unknown SNMP destination form');
        } else if(t[value] && (version<0 || ['1','2c','2'].includes(w[version+1])) && !['version','udp-port','vrf'].includes(w[value]))token(t[value],'SECRET','SNMP destination community',100);
        else flag(line,'Unknown SNMP destination form');
        credentialHandled=true;
      }
      else if (head === 'snmp-server' && w[1] === 'user') {
        declare(t[2], 'USER', 'SNMP username');
        declare(t[3], 'NAME', 'SNMP group name');
        const auth=w.indexOf('auth',4),priv=w.indexOf('priv',4);
        if(auth>=0 && ['md5','sha','sha-224','sha-256','sha-384','sha-512'].includes(w[auth+1]) && t[auth+2])token(t[auth+2],'SECRET','SNMP authentication value',100);
        else if(auth>=0 || !t[3])flag(line,'Unknown SNMP authentication form');
        if(priv>=0) {let value=priv+2;if(['128','192','256'].includes(w[value]))value++;if(['aes','aes128','aes192','aes256','des','3des'].includes(w[priv+1]) && t[value])token(t[value],'SECRET','SNMP privacy value',100);else flag(line,'Unknown SNMP privacy form');}
        credentialHandled = true;
      } else if (head === 'ntp' && w[1] === 'authentication-key') {secretTail(4, 'Time authentication key'); credentialHandled = true;}
      else if (head === 'crypto' && w[1] === 'isakmp' && w[2] === 'key') {
        const index = /^(?:0|6)$/.test(w[3] || '') ? 4 : 3; token(t[index], 'SECRET', 'Shared key', 100); credentialHandled = !!t[index];
      } else if (head === 'pre-shared-key') {secretTail(['local','remote'].includes(w[1]) ? 2 : 1, 'Shared key'); credentialHandled = true;}
      else if (head === 'key-string') {secretTail(1, 'Key chain value'); credentialHandled = true;}
      else if (head === 'key' && serverContext && w[1] !== 'chain') {secretTail(1, 'Authentication server key'); credentialHandled = true;}
      else {
        const key = w.findIndex((value, index) => ['password','secret','authentication-key'].includes(value) && (index > 0 || value !== 'authentication-key'));
        if (key >= 0 && !['encryption','recovery','policy','strength-check'].includes(w[key + 1])) {secretTail(key + 1, 'Password or secret'); credentialHandled = true;}
        const legacyKey = ['tacacs-server','radius-server','server-private'].includes(head) ? w.indexOf('key') : -1;
        if (legacyKey >= 0) {secretTail(legacyKey + 1, 'Authentication server key'); credentialHandled = true;}
        const digest = w.indexOf('message-digest-key');
        if (digest >= 0) {secretTail(digest + 3, 'Routing authentication key'); credentialHandled = true;}
        if (head === 'standby' || (head === 'ip' && w[1] === 'ospf')) {
          const auth = w.indexOf('authentication');
          if (auth >= 0 && t[auth + 1] && !['message-digest','null','key-chain'].includes(w[auth + 1])) {
            let index = auth + 1; if (['md5','text'].includes(w[index])) index++; if (w[index] === 'key-string') index++;
            secretTail(index, 'Routing authentication value'); credentialHandled = true;
          }
        }
      }
    }
    if (!credentialHandled && head !== 'no' && /\b(?:password|secret|community|key-string|pre-shared-key|private-key|authentication-key)\b/i.test(line.text) && !/^(?:\s*service password-encryption|\s*no\s)/i.test(line.text)) flag(line, 'Unrecognized sensitive command');
    if (head === 'key' && !serverContext && w[1] !== 'chain' && !/^\d+$/.test(w[1] || '')) flag(line, 'Unrecognized key command');
    // Address masks are retained only where the command grammar identifies their role.
    const masks = new Set<number>(), prefixes = new Map<number,number>();
    const maskPrefix = (index: number, wildcard = false) => {
      if (!t[index+1] || isIP(t[index+1].value)!==4) return;
      let value = t[index+1].value.split('.').reduce((n,part) => (n*256+Number(part))>>>0,0);
      if (wildcard) value = (~value)>>>0;
      const binary = value.toString(2).padStart(32,'0');
      masks.add(index+1); prefixes.set(index,/^1*0*$/.test(binary) ? (binary.indexOf('0')<0 ? 32 : binary.indexOf('0')) : -1);
    };
    const address = w[0] === 'ip' && w[1] === 'address' ? 2 : w[0] === 'ip' && w[1] === 'route' ? (w[2] === 'vrf' ? 4 : 2) : -1;
    if (address >= 0 && isIP(t[address]?.value || '') === 4 && isIP(t[address + 1]?.value || '') === 4) maskPrefix(address);
    if (head === 'network' && w.includes('area')) maskPrefix(1,true);
    if (head === 'network' && w[2] === 'mask' && isIP(t[3]?.value || '')===4) {const value=t[3].value.split('.').map(v=>Number(v).toString(2).padStart(8,'0')).join(''); if(/^1*0*$/.test(value)){masks.add(3);prefixes.set(1,value.indexOf('0')<0?32:value.indexOf('0'));}}
    if (w.includes('access-list') || head === 'access-list' || w.includes('access-group') || ['permit','deny'].includes(head) || /^\d+$/.test(head)) {
      for (let i=0; i+1<t.length; i++) {
        if(w[i-1]==='host') continue;
        if(isIP(t[i].value)===4 && isIP(t[i+1].value)===4) {maskPrefix(i,true);i++;}
      }
    }
    for (let i = 0; i < t.length; i++) {
      const value = t[i].value.replace(/^"|"$/g, ''), slash = value.indexOf('/'), base = slash < 0 ? value : value.slice(0, slash);
      if (!masks.has(i) && isIP(base)) {const skip = t[i].value.startsWith('"') ? 1 : 0; add(t[i].start + skip, t[i].start + skip + base.length, 'IP', 'Network address', 40); const span=spans.at(-1)!; const cidr=slash<0?undefined:Number(value.slice(slash+1)); span.prefix=prefixes.get(i) ?? (cidr!==undefined && Number.isInteger(cidr) && cidr>=0 && cidr<=(isIP(base)===4?32:128) ? cidr : undefined);}
      if (/^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(value) || /^(?:[\da-f]{4}\.){2}[\da-f]{4}$/i.test(value) || /^(?:[\da-f]{2}-){5}[\da-f]{2}$/i.test(value)) token(t[i], 'MAC', 'Hardware address', 40);
    }
  }
  // References use exact tokens, not substrings. Values in opaque regions lose to their higher priority span.
  for (const line of lines) for (const t of tokens(line)) {
    const category = declared.get(t.value); if (category) token(t, category, 'Declared value reference');
  }
  return {spans, flags};
}

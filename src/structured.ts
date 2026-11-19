import {isIP} from 'node:net';
import {Scan} from './types';

// Keep source offsets so the existing review and manual masking controls still apply.
export function scanJson(source:string):Scan {
  const result:Scan={spans:[],flags:[]};
  const fail=()=>({spans:[],flags:[{start:0,end:source.length,rule:'Malformed or unsupported JSON. Use strict JSON with at most 128 nesting levels.'}]});
  try {JSON.parse(source);} catch {return fail();}
  const tokens=[...source.matchAll(/"(?:[^"\\]|\\[\s\S])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g)];
  let at=0;
  const sensitive=/(?:password|secret|community|passphrase|private.?key|shared.?key|api.?key|token|credential|certificate|^key$)/i;
  const mask=(token:RegExpMatchArray,secret:boolean,key=false)=>{
    const raw=token[0],quoted=raw[0]==='"',value=quoted?JSON.parse(raw):raw;
    const start=token.index!+(quoted?1:0),end=token.index!+raw.length-(quoted?1:0);
    const parts=value.split('/'),family=isIP(parts[0]);
    if(!secret && family && parts.length<=2 && value===raw.slice(1,-1)) {
      const prefix=parts.length===2 && /^\d+$/.test(parts[1])?Number(parts[1]):undefined;
      if(parts.length===2 && (prefix===undefined || prefix>(family===4?32:128))) {
        result.flags.push({start,end,rule:'Invalid address prefix. Mask this value.'});return;
      }
      result.spans.push({start,end:start+parts[0].length,category:'IP',priority:40,rule:'JSON network address',prefix});
    } else if(!key || secret || family) {
      if(end>start)result.spans.push({start,end,category:secret?'SECRET':'NAME',priority:secret?100:60,rule:'JSON value'});
    }
  };
  const visit=(secret=false,depth=0):void=>{
    if(depth>128)throw new Error('depth');
    const token=tokens[at++];
    if(token[0]==='{') {
      while(tokens[at][0]!=='}') {
        const key=tokens[at++],name=JSON.parse(key[0]);at++;
        mask(key,false,true);
        visit(secret || sensitive.test(name),depth+1);
        if(tokens[at][0]===',')at++;
      }
      at++;
    } else if(token[0]==='[') {
      while(tokens[at][0]!==']') {visit(secret,depth+1);if(tokens[at][0]===',')at++;}at++;
    } else if(token[0][0]==='"' || secret)mask(token,secret);
  };
  try {visit();} catch {return fail();}
  return result;
}

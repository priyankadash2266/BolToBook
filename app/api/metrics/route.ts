import {runtimeEnv as env,json,sameOrigin} from '../runtime';
const names=new Set(['visit','pricing_view','buy_click','studio_open','idea_saved','book_created','preview_created','export_created']);
export async function POST(r:Request){
 if(!sameOrigin(r))return json({error:'Invalid origin'},403);
 try{const b=await r.json() as Record<string,string>;if(!names.has(b.name)||!/^[a-zA-Z0-9-]{12,80}$/.test(b.visitor??'')||!/^[a-zA-Z0-9-]{12,150}$/.test(b.id??''))return json({error:'Invalid event'},400);
 const day=new Date().toISOString().slice(0,10);const n=await env.DB.prepare('SELECT COUNT(*) n FROM events WHERE visitor=? AND day=?').bind(b.visitor,day).first<{n:number}>();if((n?.n??0)>150)return json({error:'Limit reached'},429);
 await env.DB.prepare('INSERT OR IGNORE INTO events(id,visitor,name,device,day,created) VALUES(?,?,?,?,?,?)').bind(b.id,b.visitor,b.name,['mobile','tablet','desktop'].includes(b.device)?b.device:'desktop',day,new Date().toISOString()).run();return json({ok:true});
 }catch{return json({error:'Could not record event'},400)}
}

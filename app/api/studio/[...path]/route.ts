import { verifiedSession } from '../../../../server/supabase';
import { runtime } from '../../../../server/database';
import { json, sameOrigin } from '../../runtime';
import { countWords } from '../../../../src/lib/text';

export const dynamic='force-dynamic';
type Row=Record<string,any>;
const allowed=new Set(['books','chapters','laps','entities','versions','feedback','audio','media','profile','credits']);
async function handler(req:Request){
 try{
  if(req.method!=='GET'&&!sameOrigin(req))return json({error:'Invalid origin'},403);
  const user=await verifiedSession();if(!user)return json({error:'Sign in to save your writing'},401);
  const env=runtime(user.token);const owner=user.userId, db=env.DB, bucket=env.BUCKET;
  const now=()=>new Date().toISOString();const uid=()=>crypto.randomUUID();
  const path=new URL(req.url).pathname.split('/api/studio/')[1].split('/');
  const [kind,id,sub,action]=path, method=req.method, query=new URL(req.url).searchParams;
  const read=async(k:string,i:string):Promise<Row|undefined>=>{const r=await db.prepare('SELECT data FROM records WHERE owner=? AND kind=? AND id=?').bind(owner,k,i).first<{data:string}>();return r?JSON.parse(r.data):undefined};
  const list=async(k:string,b?:string):Promise<Row[]>=>{const s=b?db.prepare('SELECT data FROM records WHERE owner=? AND kind=? AND book_id=?').bind(owner,k,b):db.prepare('SELECT data FROM records WHERE owner=? AND kind=?').bind(owner,k);return (await s.all<{data:string}>()).results.map(r=>JSON.parse(r.data))};
  const statement=(k:string,r:Row)=>db.prepare('INSERT INTO records(owner,kind,id,book_id,data,updated) VALUES(?,?,?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET data=excluded.data,book_id=excluded.book_id,updated=excluded.updated').bind(owner,k,r.id,r.bookId??null,JSON.stringify(r),now());
  const write=async(k:string,r:Row)=>{await statement(k,r).run();return r};
  const remove=async(k:string,i:string)=>{await db.prepare('DELETE FROM records WHERE owner=? AND kind=? AND id=?').bind(owner,k,i).run()};
  const body=async()=>{const text=await req.text();if(text.length>4_000_000)throw new Error('Request too large');return text?JSON.parse(text):{}};
  const bookExists=async(b:string)=>!!await read('books',b);
  const profile=async()=>await read('profile','me')??{id:'me',name:user.fullName??'',country:'IN',appLang:'en',onboarded:false,recordingRetention:'30d',mixedSpeech:'keep',createdAt:now(),updatedAt:now()};
  const empty=()=>new Response(null,{status:204});
  if(kind==='me'&&sub===undefined&&id===undefined){
   if(method==='GET')return json(await profile());
   if(method==='PATCH'){const b=await body(),old=await profile();const next={...old,...b,id:'me',updatedAt:now()};await write('profile',next);return json(next)}
  }
  if(kind==='me'&&id==='data'&&method==='DELETE'){
   for(const k of ['audio','media'])for(const r of await list(k))await bucket.delete(`${owner}/${k}/${r.id}`);
   await db.prepare('DELETE FROM records WHERE owner=?').bind(owner).run();return empty();
  }
  if(kind==='billing'){
   // Evaluation credits only. No money is collected or represented as paid revenue.
   const prices={cover:5,preview:2,export:3,currency:'credits'};
   if(id==='prices')return json(prices);
   await db.prepare('INSERT OR IGNORE INTO records(owner,kind,id,book_id,data,updated) VALUES(?,?,?,?,?,?)').bind(owner,'credits','welcome',null,JSON.stringify({id:'welcome',kind:'grant',amount:100,note:'Free beta test credits — not money',createdAt:now()}),now()).run();
   const ledger=await list('credits');
   if(id==='balance')return json({balance:ledger.reduce((a,r)=>a+r.amount,0)});
   if(id==='ledger')return json(ledger.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100));
   if(method==='POST'&&(id==='charge'||id==='topup')){
    const b=await body();if(id==='charge'&&!['cover','preview','export'].includes(b.kind))return json({error:'Unknown operation'},400);
    const units=Math.min(30,Math.max(1,Math.floor(Number(b.units)||1)));
    const amount=id==='topup'?Math.min(1000,Math.max(0,Number(b.amount)||0)):-prices[b.kind as 'cover'|'preview'|'export']*units;
    const entry={id:uid(),kind:id==='topup'?'topup':b.kind,amount,note:String(b.note??'Beta credits').slice(0,300),bookId:b.bookId,ref:b.ref,createdAt:now()};
    if(id==='charge'){
     const q=await db.prepare('INSERT INTO records(owner,kind,id,book_id,data,updated) SELECT ?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(json_extract(data,\'$.amount\')),0) FROM records WHERE owner=? AND kind=\'credits\')>=?').bind(owner,'credits',entry.id,entry.bookId??null,JSON.stringify(entry),now(),owner,-amount).run();
     if(!q.meta.changes)return json({error:'insufficient-credits'},402);
    }else await write('credits',entry);
    return json(entry);
   }
  }
  if(kind==='export'&&method==='GET'){
   const out:Row={format:'dictationer-export',version:1,exportedAt:now(),profile:await profile()};
   for(const k of ['books','chapters','laps','entities','versions','feedback'])out[k]=await list(k);
   return json(out);
  }
  if(kind==='import'&&method==='POST'){
   const b=await body();if(b.format!=='dictationer-export')return json({error:'Invalid backup'},400);
   const jobs:ReturnType<typeof db.prepare>[]=[];
   for(const k of ['books','chapters','laps','entities','versions','feedback']){
    if(!Array.isArray(b[k]??[]))return json({error:'Invalid backup rows'},400);
    for(const r of b[k]??[]){if(typeof r.id!=='string'||r.id.length>128)return json({error:'Invalid record'},400);jobs.push(statement(k,r))}
   }
   if(jobs.length>5000)return json({error:'Backup too large'},413);
   if(b.profile)jobs.push(statement('profile',{...b.profile,id:'me'}));
   for(let i=0;i<jobs.length;i+=80)await db.batch(jobs.slice(i,i+80));return empty();
  }
  if(kind==='audio'||kind==='media'){
   const p=await profile();
   if(kind==='audio'&&p.recordingRetention!=='forever'){
    const cutoff=p.recordingRetention==='none'?Date.now()+1:Date.now()-30*864e5;
    for(const r of await list('audio'))if(Date.parse(r.createdAt)<cutoff){await bucket.delete(`${owner}/audio/${r.id}`);await remove('audio',r.id)}
   }
   if(kind==='audio'&&id==='stats'){const a=await list(kind);return json({count:a.length,bytes:a.reduce((s,r)=>s+r.size,0),durationMs:a.reduce((s,r)=>s+(r.durationMs||0),0)})}
   if(method==='POST'&&!id){
    const fd=await req.formData(),file=fd.get('file');if(!(file instanceof File))return json({error:'Missing file'},400);
    if(file.size>25*1024*1024)return json({error:'Maximum file size is 25 MB'},413);
    const bookId=String(fd.get('bookId')??'')||undefined;if(bookId&&!await bookExists(bookId))return json({error:'Book not found'},404);
    const i=uid();await bucket.put(`${owner}/${kind}/${i}`,file.stream(),{httpMetadata:{contentType:file.type||'application/octet-stream'}});
    await write(kind,{id:i,bookId,name:String(fd.get('name')??file.name),mime:file.type,size:file.size,durationMs:Number(fd.get('durationMs')??0),createdAt:now()});return json({id:i});
   }
   if(method==='DELETE'&&!id){for(const r of await list(kind)){await bucket.delete(`${owner}/${kind}/${r.id}`);await remove(kind,r.id)}return empty()}
   const r=await read(kind,id);if(!r)return json({error:'File not found'},404);
   if(method==='GET'&&sub==='meta')return json(r);
   if(method==='GET'){const file=await bucket.get(`${owner}/${kind}/${id}`);return file?new Response(file.body,{headers:{'Content-Type':r.mime||'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}):json({error:'File not found'},404)}
   if(method==='DELETE'){await bucket.delete(`${owner}/${kind}/${id}`);await remove(kind,id);return empty()}
  }
  if(kind==='books'&&id&&sub){
   if(!await bookExists(id))return json({error:'Book not found'},404);
   if(sub==='draft'){
    const i=`draft-${id}`;let c=await read('chapters',i);if(!c)c=await write('chapters',{id:i,bookId:id,order:0,role:'draft',title:'',content:'',status:'empty',wordCount:0,createdAt:now(),updatedAt:now()});return json(c);
   }
   if(sub==='chapters'&&action==='order'&&method==='PUT'){
    const b=await body();const rows=await list('chapters',id);if(!Array.isArray(b.orderedIds)||b.orderedIds.some((i:string)=>!rows.some(r=>r.id===i)))return json({error:'Invalid chapter order'},400);
    await db.batch(b.orderedIds.map((i:string,n:number)=>statement('chapters',{...rows.find(r=>r.id===i),order:n+1,updatedAt:now()})));return empty();
   }
   if(['chapters','entities','versions','feedback','media'].includes(sub)&&method==='GET'){
    let rows=await list(sub,id);if(sub==='chapters')rows=rows.filter(r=>r.role!=='draft').sort((a,b)=>a.order-b.order);
    for(const k of ['kind','chapterId'])if(query.get(k))rows=rows.filter(r=>r[k]===query.get(k));
    return json(rows);
   }
   if(sub==='chapters'&&method==='POST'){
    const b=await body(),rows=await list('chapters',id),content=String(b.content??'');
    return json(await write('chapters',{...b,id:uid(),bookId:id,title:b.title??'',content,order:b.order??Math.max(0,...rows.map(r=>r.order))+1,status:content?'drafting':'empty',wordCount:countWords(content),createdAt:now(),updatedAt:now()}));
   }
  }
  if(kind==='versions'&&sub==='restore'&&method==='POST'){
   const v=await read('versions',id);if(!v)return json({error:'Version not found'},404);const c=await read('chapters',v.chapterId);if(!c)return json({error:'Chapter not found'},404);
   const b=await body();if(!['before','after'].includes(b.which))return json({error:'Invalid restore'},400);
   const next={...c,content:v[b.which],wordCount:countWords(v[b.which]),updatedAt:now()};
   await db.batch([statement('chapters',next),statement('versions',{id:uid(),bookId:c.bookId,chapterId:c.id,chapterTitle:c.title,source:'restore',summary:'Restored saved version',before:c.content,after:next.content,createdAt:now()})]);return json(next);
  }
  if(!allowed.has(kind)||['profile','credits','versions'].includes(kind))return json({error:'Route not found'},404);
  if(method==='GET'){
   if(id)return json(await read(kind,id)??null);
   let rows=await list(kind);for(const key of ['bookId','status','chapterId'])if(query.get(key))rows=rows.filter(r=>r[key]===query.get(key));return json(rows.sort((a,b)=>(b.updatedAt??b.createdAt).localeCompare(a.updatedAt??a.createdAt)));
  }
  if(method==='POST'&&!id){
   const b=await body();if(b.bookId&&!await bookExists(b.bookId))return json({error:'Book not found'},404);
   const defaults:Row=kind==='books'?{author:(await profile()).name,type:'fiction',lang:'en',stage:'idea',country:'IN',title:'',fields:{}}:kind==='laps'?{text:'',status:'inbox',source:'typed'}:kind==='entities'?{name:'',fields:{}}:{};
   return json(await write(kind,{...defaults,...b,id:uid(),createdAt:now(),updatedAt:now()}));
  }
  const old=await read(kind,id);if(!old)return json({error:'Not found'},404);
  if(method==='PATCH'){
   const b=await body();if(b.bookId&&!await bookExists(b.bookId))return json({error:'Book not found'},404);
   const {version,...patch}=b;const next={...old,...patch,id:old.id,createdAt:old.createdAt,updatedAt:now()};
   if(patch.fields)next.fields={...old.fields,...patch.fields};
   if(kind==='chapters'&&patch.content!==undefined){next.wordCount=countWords(next.content);if(!patch.status&&old.status!=='done')next.status=next.content.trim()?'drafting':'empty';}
   const jobs=[statement(kind,next)];
   if(kind==='chapters'&&patch.content!==undefined&&old.content!==next.content)jobs.push(statement('versions',{id:uid(),bookId:old.bookId,chapterId:id,chapterTitle:next.title,source:version?.source??'typed',summary:version?.summary??'Saved writing',before:old.content,after:next.content,createdAt:now()}));
   await db.batch(jobs);return json(next);
  }
  if(method==='DELETE'){
   if(kind==='books'){
    for(const k of ['audio','media'])for(const r of await list(k,id))await bucket.delete(`${owner}/${k}/${r.id}`);
    await db.prepare('DELETE FROM records WHERE owner=? AND (book_id=? OR (kind=\'books\' AND id=?))').bind(owner,id,id).run();
   }else await remove(kind,id);return empty();
  }
  return json({error:'Unsupported operation'},405);
 }catch(e){console.error('studio request failed',e instanceof Error?e.message:'unknown');return json({error:'Your change could not be saved. Please retry.'},500)}
}
export {handler as GET,handler as POST,handler as PATCH,handler as PUT,handler as DELETE};

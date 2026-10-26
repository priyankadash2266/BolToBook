import { rpc,sbFetch } from './supabase';
// Compatibility layer for the existing application API. SQL is never executed dynamically.
export function runtime(token?:string){
 class Statement{
  args:any[]=[];constructor(public sql:string){} bind(...args:any[]){this.args=args;return this}
  async execute(){return rpc('book_query',{q:this.sql,a:this.args},token)}
  async first<T=any>():Promise<T|null>{const rows=await this.execute();return rows?.[0]??null}
  async all<T=any>():Promise<{results:T[]}>{return {results:await this.execute()??[]}}
  async run(){const rows=await this.execute();return {meta:{changes:rows?.[0]?.changes??1}}}
 }
 const DB={prepare:(sql:string)=>new Statement(sql),batch:async(statements:Statement[])=>rpc('book_batch',{jobs:statements.map(s=>({q:s.sql,a:s.args}))},token)};
 const BUCKET={
  async put(key:string,stream:ReadableStream,options:any){const bytes=await new Response(stream).arrayBuffer();const r=await sbFetch(`/storage/v1/object/manuscripts/${key}`,token,{method:'POST',headers:{'Content-Type':options.httpMetadata.contentType},body:bytes});if(!r.ok)throw new Error('File upload failed')},
  async get(key:string){const r=await sbFetch(`/storage/v1/object/authenticated/manuscripts/${key}`,token);return r.ok?{body:r.body}:null},
  async delete(key:string){const r=await sbFetch('/storage/v1/object/manuscripts',token,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:[key]})});if(!r.ok)throw new Error('File deletion failed')}
 };
 return {DB,BUCKET};
}

import { env } from 'cloudflare:workers';
export const runtimeEnv=env as unknown as {DB:D1Database;BUCKET:R2Bucket;FOUNDER_EMAIL?:string;OPENAI_API_KEY?:string};
export const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(r:Request){const o=r.headers.get('Origin');return !o || o===new URL(r.url).origin;}

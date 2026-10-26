import { cookies } from 'next/headers';
export const supabaseUrl=()=>process.env.SUPABASE_URL!;
export const publishableKey=()=>process.env.SUPABASE_PUBLISHABLE_KEY!;
export async function sbFetch(path:string,token?:string,init:RequestInit={}){
 const r=await fetch(`${supabaseUrl()}${path}`,{...init,cache:'no-store',headers:{apikey:publishableKey(),...(token?{Authorization:`Bearer ${token}`} : {}),...init.headers}});
 return r;
}
export async function setSession(s:{access_token:string;refresh_token:string;expires_in:number}){
 const jar=await cookies();const opts={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
 jar.set('bb_access',s.access_token,{...opts,maxAge:s.expires_in});jar.set('bb_refresh',s.refresh_token,{...opts,maxAge:60*60*24*30});
}
export async function clearSession(){const jar=await cookies();jar.delete('bb_access');jar.delete('bb_refresh')}
export async function verifiedSession(){
 const jar=await cookies();let token=jar.get('bb_access')?.value;
 let r=token?await sbFetch('/auth/v1/user',token):null;
 if(!r?.ok){const refresh=jar.get('bb_refresh')?.value;if(!refresh)return null;
 const renewed=await sbFetch('/auth/v1/token?grant_type=refresh_token',undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:refresh})});
 if(!renewed.ok)return null;const s:any=await renewed.json();await setSession(s);token=s.access_token;r=await sbFetch('/auth/v1/user',token);
 }
 if(!r.ok)return null;const u:any=await r.json();return {token:token!,userId:u.id,email:u.email??'',fullName:u.user_metadata?.full_name??null};
}
export async function rpc(name:string,args:unknown,token?:string):Promise<any>{const r=await sbFetch(`/rest/v1/rpc/${name}`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)});if(!r.ok)throw new Error(`Database operation failed (${r.status})`);return r.status===204?null:r.json()}

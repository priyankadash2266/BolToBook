import {sbFetch,setSession,clearSession,verifiedSession} from '../../../server/supabase';
import {json,sameOrigin} from '../runtime';
export async function POST(r:Request){
 if(!sameOrigin(r))return json({error:'Invalid origin'},403);
 try{const b:any=await r.json();
 if(b.action==='logout'){const u=await verifiedSession();if(u)await sbFetch('/auth/v1/logout',u.token,{method:'POST'});await clearSession();return json({ok:true})}
 const email=String(b.email??'').trim(),password=String(b.password??'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||password.length<8||password.length>256)return json({error:'Enter a valid email and password of at least 8 characters.'},400);
 const signup=b.action==='signup';if(!signup&&b.action!=='login')return json({error:'Invalid action'},400);
 const response=await sbFetch(signup?'/auth/v1/signup':'/auth/v1/token?grant_type=password',undefined,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
 const s:any=await response.json();if(!response.ok)return json({error:s.msg??s.message??s.error_description??'Sign-in failed. Please retry.'},response.status===429?429:400);
 if(s.access_token){await setSession(s);return json({ok:true})}
 return json({confirmation:true,message:'Check your email to confirm your account, then return here to sign in.'});
 }catch{return json({error:'Unable to reach sign-in. Please retry.'},503)}
}

import {runtimeEnv as env,json,sameOrigin} from '../runtime';
export async function POST(r:Request){
 if(!sameOrigin(r))return json({error:'Invalid origin'},403);
 try{const b=await r.json() as Record<string,unknown>;const email=String(b.email??'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||b.consent!==true||!/^[a-zA-Z0-9-]{12,80}$/.test(String(b.visitor)))return json({error:'Enter a valid email and consent to the beta update'},400);
 await env.DB.prepare('INSERT INTO interests(email,visitor,plan,price,created) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET plan=excluded.plan,price=excluded.price').bind(email,b.visitor,'Founding Author',499,new Date().toISOString()).run();return json({ok:true});
 }catch{return json({error:'Could not save your interest. Please retry.'},500)}
}

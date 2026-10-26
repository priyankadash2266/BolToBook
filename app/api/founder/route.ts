import {getChatGPTUser} from '../../chatgpt-auth';
import {runtimeEnv as env,json} from '../runtime';
export async function GET(){
 const u=await getChatGPTUser();if(!u||!env.FOUNDER_EMAIL||u.email.toLowerCase()!==env.FOUNDER_EMAIL.toLowerCase())return json({error:'Founder access required'},403);
 const totals=await env.DB.prepare('SELECT name,COUNT(*) events,COUNT(DISTINCT visitor) visitors FROM events GROUP BY name').all();
 const devices=await env.DB.prepare("SELECT device,COUNT(DISTINCT visitor) visitors FROM events WHERE name='visit' GROUP BY device").all();
 const daily=await env.DB.prepare("SELECT day,COUNT(DISTINCT CASE WHEN name='visit' THEN visitor END) visitors,COUNT(DISTINCT CASE WHEN name='buy_click' THEN visitor END) buyers FROM events WHERE day>=date('now','-29 days') GROUP BY day ORDER BY day").all();
 const interest=await env.DB.prepare('SELECT COUNT(*) n FROM interests').first();
 const recent=await env.DB.prepare('SELECT email,plan,price,created FROM interests ORDER BY created DESC LIMIT 100').all();
 return json({totals:totals.results,devices:devices.results,daily:daily.results,interested:interest?.n??0,recent:recent.results,updated:new Date().toISOString()});
}

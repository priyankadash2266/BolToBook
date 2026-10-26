import {verifiedSession,rpc} from '../../../server/supabase';
import {json} from '../runtime';
export const dynamic='force-dynamic';
export async function GET(){const u=await verifiedSession();if(!u||u.email.toLowerCase()!==process.env.FOUNDER_EMAIL?.toLowerCase())return json({error:'Founder access required'},403);try{return json(await rpc('founder_report',{},u.token))}catch{return json({error:'Unable to load analytics'},500)}}

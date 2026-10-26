import {rpc} from '../../../server/supabase';
import {json,sameOrigin} from '../runtime';
export async function POST(r:Request){if(!sameOrigin(r))return json({error:'Invalid origin'},403);try{const b=await r.json();return json(await rpc('capture_interest',{payload:b}))}catch{return json({error:'Could not save your interest. Please check your email, consent and retry.'},400)}}

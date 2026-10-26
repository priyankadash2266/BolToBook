import {rpc} from '../../../server/supabase';
import {json,sameOrigin} from '../runtime';
export async function POST(r:Request){if(!sameOrigin(r))return json({error:'Invalid origin'},403);try{const b=await r.json();return json(await rpc('capture_event',{payload:b}))}catch{return json({error:'Event not accepted'},400)}}

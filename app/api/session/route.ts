import {verifiedSession} from '../../../server/supabase';
import {json} from '../runtime';
export const dynamic='force-dynamic';
export async function GET(){const u=await verifiedSession();return json({signedIn:!!u,founder:!!u&&u.email.toLowerCase()===process.env.FOUNDER_EMAIL?.toLowerCase(),ai:false})}

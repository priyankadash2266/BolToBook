import {getChatGPTUser} from '../../chatgpt-auth';
import {runtimeEnv,json} from '../runtime';
export async function GET(){const u=await getChatGPTUser();return json({signedIn:!!u,founder:!!u&&!!runtimeEnv.FOUNDER_EMAIL&&u.email.toLowerCase()===runtimeEnv.FOUNDER_EMAIL.toLowerCase(),ai:!!runtimeEnv.OPENAI_API_KEY})}

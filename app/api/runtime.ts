export const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export function sameOrigin(r:Request){const o=r.headers.get('Origin');return !o||o===new URL(r.url).origin;}

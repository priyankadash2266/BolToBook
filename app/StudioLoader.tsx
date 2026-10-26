"use client";
import { useEffect, useState, type ComponentType } from 'react';
export default function StudioLoader(){
 const [Studio,setStudio]=useState<ComponentType|null>(null); const [failed,setFailed]=useState(false);
 useEffect(()=>{fetch('/api/session').then(r=>r.json() as Promise<{signedIn:boolean;founder:boolean}>).then(s=>{document.documentElement.dataset.signedin=String(s.signedIn);document.documentElement.dataset.founder=String(s.founder);return import('../src/Studio')}).then(m=>setStudio(()=>m.default)).catch(()=>setFailed(true));},[]);
 return Studio ? <Studio/> : <main style={{padding:48,fontFamily:'Georgia',background:'#f7f3e9',minHeight:'100vh'}}><h1>Dictationer</h1><p>{failed?'Unable to open your studio. Please reload.':'Opening your writing studio…'}</p>{failed&&<button onClick={()=>location.reload()}>Reload</button>}</main>;
}

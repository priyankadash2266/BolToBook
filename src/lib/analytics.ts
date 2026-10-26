export function visitorId(){let id=localStorage.getItem('dictationer.visitor');if(!id){id=crypto.randomUUID();localStorage.setItem('dictationer.visitor',id)}return id}
export async function track(name:string,once=false){
 try{if(document.documentElement.dataset.founder==='true')return;const visitor=visitorId();const day=new Date().toISOString().slice(0,10);const key=`metric-${name}-${day}`;
 if(once&&sessionStorage.getItem(key))return;
 const id=once?`${visitor}-${name}-${day}`:crypto.randomUUID();
 const device=/iPad|Tablet/i.test(navigator.userAgent)?'tablet':/Mobi|Android/i.test(navigator.userAgent)?'mobile':'desktop';
 const r=await fetch('/api/metrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name,visitor,device}),keepalive:true});
 if(r.ok&&once)sessionStorage.setItem(key,'1');
 }catch{/* Analytics never interrupts writing. */}
}

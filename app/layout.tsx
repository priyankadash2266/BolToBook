import type { Metadata } from 'next';
export const metadata:Metadata={title:'Dictationer — Your voice, your book',description:'Capture a thought. Shape a story. Create your book in English or Hindi.',manifest:'/manifest.webmanifest',icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body style={{margin:0}}>{children}</body></html>}

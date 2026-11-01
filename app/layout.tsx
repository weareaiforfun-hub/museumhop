import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Night Atlas · Museumnacht together',description:'Explore 310 activities and 69 museums, suggest your favourites, and plan a shared Amsterdam Museum Night route.',referrer:'no-referrer',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}

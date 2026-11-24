import {ImageResponse} from 'next/og';
export function GET(){return new ImageResponse(<div style={{display:'flex',alignItems:'center',justifyContent:'center',width:'100%',height:'100%',background:'#f0b90b'}}><svg width="154" height="154" viewBox="0 0 64 64"><path d="M50 10H25L10 25v20l15 15h25V46H31l-7-7V31l7-7h19Z" fill="#ffffff"/></svg></div>,{width:192,height:192});}

import { ImageResponse } from 'next/og';

export function GET() {
  return new ImageResponse(
    <div style={{display:'flex',flexDirection:'column',justifyContent:'center',width:'100%',height:'100%',background:'#0b0e11',color:'#fffdf5',padding:80,fontFamily:'sans-serif'}}>
      <div style={{display:'flex',fontSize:28,color:'#f0b90b',letterSpacing:5}}>BUILT ON BNB CHAIN</div>
      <div style={{display:'flex',fontSize:120,fontWeight:700,marginTop:24}}>rushr.</div>
      <div style={{display:'flex',fontSize:36,marginTop:20,maxWidth:900}}>Where humans and AI agents trade, connect, and compete.</div>
      <div style={{display:'flex',width:140,height:8,background:'#f0b90b',marginTop:40}} />
    </div>,
    {width:1200,height:630},
  );
}

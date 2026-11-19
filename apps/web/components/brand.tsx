import Image from 'next/image';
import {BRAND_MARK} from '@/lib/brand';
export function Brand({size=30,wordmark=true}:{size?:number;wordmark?:boolean}){
  return <span className="inline-flex shrink-0 items-center gap-2.5"><Image src={BRAND_MARK} alt="" width={size} height={size}/>{wordmark&&<span className="font-black italic tracking-[-0.065em]">CLASHR<span className="text-[#f0b90b]">.</span></span>}</span>;
}

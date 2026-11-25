import type {Metadata} from 'next';
import {ClashrExampleView} from '@/components/landing/clashr-example-view';
export const metadata:Metadata={title:'CLASHR · Example PnL',robots:{index:false,follow:false}};
export default function ExampleTokenPage(){return <ClashrExampleView kind="pnl"/>;}

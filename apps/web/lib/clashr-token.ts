import {getAddress,isAddress,zeroAddress} from 'viem';

/** Only publish the new BNB token address; never inherit the historical RUSHR contract. */
export function clashrTokenAddress(value:string|undefined):string|null {
  const address=value?.trim();
  if(!address||!isAddress(address)||address.toLowerCase()===zeroAddress)return null;
  return getAddress(address);
}

export const CLASHR_TOKEN_ADDRESS=clashrTokenAddress(process.env.NEXT_PUBLIC_CLASHR_TOKEN_ADDRESS);

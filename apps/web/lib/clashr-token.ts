import {getAddress,isAddress,zeroAddress} from 'viem';

/** Only publish the new BNB token address; never inherit the historical RUSHR contract. */
export function clashrTokenAddress(value:string|undefined):string|null {
  const address=value?.trim();
  if(!address||!isAddress(address)||address.toLowerCase()===zeroAddress)return null;
  return getAddress(address);
}

/** Official BNB launch contract supplied by the Clashr team. */
export const OFFICIAL_CLASHR_TOKEN_ADDRESS='0x79B824358BDFE9F2C1EB2D1E4E21c581bA477777';
export const CLASHR_TOKEN_ADDRESS=clashrTokenAddress(process.env.NEXT_PUBLIC_CLASHR_TOKEN_ADDRESS?.trim()||OFFICIAL_CLASHR_TOKEN_ADDRESS);

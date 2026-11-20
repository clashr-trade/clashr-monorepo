import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';

/** Persistent local implementation of the three R2 operations used by profiles. */
export function localMedia(directory:string) {
  const root=resolve(directory);
  const path=(key:string)=>{
    if(!/^(avatar|banner)\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif)$/.test(key))throw Error('Invalid media key');
    return join(root,key);
  };
  return {
    async put(key:string,value:Uint8Array){
      const file=path(key);await mkdir(resolve(file,'..'),{recursive:true});
      await writeFile(file,value,{flag:'wx'});
    },
    async get(key:string){
      try{
        const bytes=await readFile(path(key));
        const body=new Uint8Array(bytes);
        const ext=key.split('.').pop()!;
        return {body,httpMetadata:{contentType:ext==='jpg'?'image/jpeg':`image/${ext}`}};
      }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    },
    async delete(keys:string|string[]){
      await Promise.all((Array.isArray(keys)?keys:[keys]).map(async key=>{
        try{await unlink(path(key));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      }));
    },
  };
}

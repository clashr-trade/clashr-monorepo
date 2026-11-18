/** Creates a NEW dedicated database, refuses existing databases. Never copies legacy rows. */
import postgres from 'postgres';
import {readFile} from 'node:fs/promises';
const adminUrl=process.env.BNB_PRODUCT_ADMIN_URL;
const name=process.env.BNB_PRODUCT_DATABASE??'rushr_bnb_local';
if(!adminUrl||!/^rushr_bnb_[a-z0-9_]+$/.test(name))throw new Error('Explicit admin URL and rushr_bnb_* database name required');
const admin=postgres(adminUrl,{max:1,prepare:false});
try {
  const [exists]=await admin`select 1 from pg_database where datname=${name}`;
  if(exists)throw new Error('Refusing to modify an existing database. Choose a new name.');
  await admin.unsafe(`create database ${name}`);
  const url=new URL(adminUrl);url.pathname=`/${name}`;
  const sql=postgres(url.toString(),{max:1,prepare:false,onnotice:()=>{}});
  try {
    const journal=JSON.parse(await readFile(new URL('../migrations/meta/_journal.json',import.meta.url),'utf8')) as {entries:{tag:string;idx:number}[]};
    for(const entry of journal.entries.filter(e=>e.idx<=11)){
      const migration=await readFile(new URL(`../migrations/${entry.tag}.sql`,import.meta.url),'utf8');
      for(const stmt of migration.split('--> statement-breakpoint'))if(stmt.trim())await sql.unsafe(stmt);
    }
    await sql.unsafe(await readFile(new URL('../product/0001_bnb_product.sql',import.meta.url),'utf8'));
    await sql.unsafe(await readFile(new URL('../product/0002_receipt_recovery.sql',import.meta.url),'utf8'));
    console.log(`Initialized dedicated BNB database ${name}; no historical data imported`);
  }finally{await sql.end();}
}finally{await admin.end();}

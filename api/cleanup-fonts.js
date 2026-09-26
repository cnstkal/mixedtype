import { list, del } from '@vercel/blob';

export default async function handler(req,res){
  const cronSecret=process.env.CRON_SECRET;
  const auth=req.headers.authorization||'';
  const isVercelCron=(req.headers['user-agent']||'').includes('vercel-cron/1.0');
  if(cronSecret && auth!==`Bearer ${cronSecret}`)return res.status(401).send('Unauthorized');
  if(!cronSecret && !isVercelCron)return res.status(401).send('Unauthorized');
  try{
    let cursor;
    let deleted=0;
    do{
      const page=await list({prefix:'mixedtype-temp/',limit:1000,cursor});
      const expired=page.blobs.filter(blob=>{
        const match=blob.pathname.match(/^mixedtype-temp\/(\d+)-/);
        return match && Number(match[1])<=Date.now();
      });
      if(expired.length){
        await del(expired.map(blob=>blob.url));
        deleted+=expired.length;
      }
      cursor=page.hasMore?page.cursor:undefined;
    }while(cursor);
    return res.status(200).json({ok:true,deleted});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:'Cleanup failed'});
  }
}

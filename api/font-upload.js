import { put } from '@vercel/blob';
import crypto from 'node:crypto';

export const config = { api: { bodyParser: false } };

const MAX_SIZE = 4 * 1024 * 1024;
const TTL = 24 * 60 * 60 * 1000;
const ALLOWED = new Set([
  'font/woff','font/woff2','font/ttf','font/otf',
  'application/font-woff','application/font-woff2',
  'application/x-font-ttf','application/x-font-opentype',
  'application/octet-stream'
]);

function readBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    req.on('data',chunk=>{
      size+=chunk.length;
      if(size>MAX_SIZE){reject(new Error('FONT_TOO_LARGE'));req.destroy();return}
      chunks.push(chunk);
    });
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
function sign(value){
  return crypto.createHmac('sha256',process.env.BLOB_READ_WRITE_TOKEN||'').update(value).digest('hex');
}
function safeName(name){
  return (name||'font').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({error:'BLOB_READ_WRITE_TOKEN is not configured'});
  const contentType=(req.headers['content-type']||'application/octet-stream').split(';')[0];
  if(!ALLOWED.has(contentType))return res.status(415).json({error:'Unsupported font type'});
  try{
    const body=await readBody(req);
    if(!body.length)return res.status(400).json({error:'Empty font'});
    const {URL}=globalThis;
    const filename=safeName(new URL(req.url,'http://localhost').searchParams.get('filename'));
    const expiresAt=Date.now()+TTL;
    const id=crypto.randomUUID();
    const pathname=`mixedtype-temp/${expiresAt}-${id}-${filename}`;
    const blob=await put(pathname,body,{access:'private',addRandomSuffix:false,contentType,cacheControlMaxAge:60});
    const payload=`${pathname}|${expiresAt}`;
    const sig=sign(payload);
    const family='MyFont-'+id.slice(0,8);
    return res.status(200).json({
      id,
      family,
      pathname,
      expiresAt,
      url:`/api/font-file?pathname=${encodeURIComponent(pathname)}&expires=${expiresAt}&sig=${sig}`
    });
  }catch(error){
    if(error?.message==='FONT_TOO_LARGE')return res.status(413).json({error:'폰트 파일은 4MB 이하만 등록할 수 있어.'});
    console.error(error);
    return res.status(500).json({error:'Font upload failed'});
  }
}

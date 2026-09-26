import { get } from '@vercel/blob';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';

function sign(value){
  return crypto.createHmac('sha256',process.env.BLOB_READ_WRITE_TOKEN||'').update(value).digest('hex');
}
function safeEqual(a,b){
  if(!a||!b||a.length!==b.length)return false;
  return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
}

export default async function handler(req,res){
  const {pathname,expires,sig}=req.query;
  if(!pathname||!expires||!sig)return res.status(400).send('Missing parameters');
  if(Date.now()>Number(expires))return res.status(410).send('Font expired');
  if(!safeEqual(sig,sign(`${pathname}|${expires}`)))return res.status(403).send('Forbidden');
  try{
    const result=await get(pathname,{access:'private'});
    if(!result||result.statusCode!==200)return res.status(404).send('Not found');
    res.setHeader('Content-Type',result.blob.contentType||'font/woff2');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','private, no-store');
    if(result.blob.etag)res.setHeader('ETag',result.blob.etag);
    Readable.fromWeb(result.stream).pipe(res);
  }catch(error){
    console.error(error);
    return res.status(404).send('Not found');
  }
}

// Read a single-file tabletop export in memory. No filesystem extraction.
async function readStudioMiniatureZip(bytes,limit){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const invalid=()=>Error('Choose a ZIP containing one .unity3d tabletop file.');
 if(bytes.length<98||bytes.length>limit)throw invalid();
 let end=bytes.length-22;
 while(end>=Math.max(0,bytes.length-65557)){
  if(view.getUint32(end,true)===0x06054b50&&end+22+view.getUint16(end+20,true)===bytes.length)break;
  end--;
 }
 if(end<0||end<bytes.length-65557||view.getUint32(end+4,true)!==0||
  view.getUint16(end+8,true)!==1||view.getUint16(end+10,true)!==1)throw invalid();
 const directory=view.getUint32(end+16,true);
 if(directory<30||directory+46>end||directory+view.getUint32(end+12,true)!==end||
  view.getUint32(directory,true)!==0x02014b50||view.getUint32(directory+42,true)!==0)throw invalid();
 const flags=view.getUint16(directory+8,true),method=view.getUint16(directory+10,true);
 const packed=view.getUint32(directory+20,true),size=view.getUint32(directory+24,true);
 if(!size||size>limit)throw Error('The extracted tabletop file must be no larger than 24 MB.');
 const nameSize=view.getUint16(directory+28,true),nameEnd=directory+46+nameSize;
 if((flags&~0x80e)||![0,8].includes(method)||view.getUint16(directory+34,true)||
  nameEnd+view.getUint16(directory+30,true)+view.getUint16(directory+32,true)!==end)throw invalid();
 const name=bytes.subarray(directory+46,nameEnd);
 if(!/^[^/\\\\:\x00]+\.unity3d$/i.test(new TextDecoder().decode(name)))throw invalid();
 const dataAt=30+view.getUint16(26,true)+view.getUint16(28,true);
 if(view.getUint32(0,true)!==0x04034b50||view.getUint16(6,true)!==flags||view.getUint16(8,true)!==method||
  view.getUint16(26,true)!==nameSize||!packed||dataAt+packed>directory||
  !name.every((byte,i)=>bytes[30+i]===byte))throw invalid();
 const payload=bytes.subarray(dataAt,dataAt+packed);
 if(method===0){
  if(packed!==size)throw invalid();
  return payload;
 }
 const output=new Uint8Array(size);
 const reader=new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
 let offset=0;
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   if(value.length>size-offset)throw invalid();
   output.set(value,offset);
   offset+=value.length;
  }
 }catch{
  await reader.cancel().catch(()=>{});
  throw invalid();
 }finally{reader.releaseLock()}
 if(offset!==size)throw invalid();
 return output;
}

if(typeof module==='object'&&module.exports)module.exports={readStudioMiniatureZip};

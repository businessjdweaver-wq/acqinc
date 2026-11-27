const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deflateRawSync}=require('node:zlib');
const {readStudioMiniatureZip}=require('./studio-miniature-zip.js');

function archive(name='figure.unity3d',declaredSize=128){
 const content=Buffer.alloc(128,42);
 const packed=deflateRawSync(content);
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50);
 local.writeUInt16LE(8,8);
 local.writeUInt16LE(name.length,26);
 const directory=Buffer.alloc(46);
 directory.writeUInt32LE(0x02014b50);
 directory.writeUInt16LE(8,10);
 directory.writeUInt32LE(packed.length,20);
 directory.writeUInt32LE(declaredSize,24);
 directory.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);
 end.writeUInt16LE(1,8);
 end.writeUInt16LE(1,10);
 end.writeUInt32LE(directory.length+name.length,12);
 end.writeUInt32LE(local.length+name.length+packed.length,16);
 const fileName=Buffer.from(name);
 return Buffer.concat([local,fileName,packed,directory,fileName,end]);
}

test('extracts a deflated Unity tabletop file',async()=>{
 assert.deepEqual(Buffer.from(await readStudioMiniatureZip(archive(),1024)),Buffer.alloc(128,42));
});
test('rejects other entries, paths and dishonest expansion sizes',async()=>{
 for(const file of [archive('notes.txt'),archive('../figure.unity3d'),archive('figure.unity3d',40),archive('figure.unity3d',2048)]){
  await assert.rejects(readStudioMiniatureZip(file,1024));
 }
});

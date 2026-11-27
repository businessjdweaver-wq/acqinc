const {test}=require('node:test');
const assert=require('node:assert/strict');
const {
 isStudioUnityBundle,validateStudioUnityBundle,decodeUnityMiniatureTexture
}=require('./studio-miniature-unity.js');

function bundle({name='CAB-abcd',expanded=8,blockType=0,dictionary=0,version='2019.1.0f2'}={}){
 const prefix=Buffer.from('UnityFS\0\0\0\0\x065.x.x\0'+version+'\0');
 const info=Buffer.alloc(55+name.length);
 info.writeUInt32BE(1,16);
 info.writeUInt32BE(expanded,20);
 info.writeUInt32BE(8,24);
 info.writeUInt16BE(blockType,28);
 info.writeUInt32BE(1,30);
 info.writeBigUInt64BE(8n,42);
 info.write(name,54);
 const header=Buffer.alloc(20);
 header.writeBigUInt64BE(BigInt(prefix.length+header.length+info.length+8));
 header.writeUInt32BE(info.length,8);
 header.writeUInt32BE(info.length,12);
 header.writeUInt32BE(64,16);
 const block=Buffer.alloc(8);
 block.writeUInt32LE(dictionary,1);
 return Buffer.concat([prefix,header,info,block]);
}
const unneeded=()=>assert.fail('Metadata is uncompressed');

test('accepts bounded UnityFS archive metadata and rejects other signatures',()=>{
 const valid=bundle();
 assert.equal(isStudioUnityBundle(valid),true);
 assert.doesNotThrow(()=>validateStudioUnityBundle(valid,unneeded));
 assert.throws(()=>validateStudioUnityBundle(valid.subarray(1),unneeded),/Expected a UnityFS/);
 assert.throws(()=>validateStudioUnityBundle(bundle({version:'2019.0.0f2'}),unneeded),/Expected a Unity 2019/);
});
test('rejects expanded-size, LZMA dictionary and path violations before unpacking',()=>{
 assert.throws(()=>validateStudioUnityBundle(bundle({expanded:40*1024*1024,blockType:3}),unneeded),/expansion limit/);
 assert.throws(()=>validateStudioUnityBundle(bundle({blockType:1,dictionary:40*1024*1024}),unneeded),/dictionary/);
 assert.throws(()=>validateStudioUnityBundle(bundle({name:'../CAB-abcd'}),unneeded),/file path/);
});
test('decodes DXT texture blocks and reverses Unity row order',()=>{
 const blocks=Buffer.alloc(16);
 blocks.writeUInt16LE(0xf800,0);
 blocks.writeUInt16LE(0x001f,8);
 const {rgba}=decodeUnityMiniatureTexture({m_Width:4,m_Height:8,m_TextureFormat:10,imageData:blocks});
 assert.deepEqual([...rgba.slice(0,4)],[0,0,255,255]);
 assert.deepEqual([...rgba.slice(-4)],[255,0,0,255]);
 assert.throws(()=>decodeUnityMiniatureTexture({m_Width:4,m_Height:8,m_TextureFormat:10,imageData:blocks.subarray(0,8)}),/Truncated/);
});

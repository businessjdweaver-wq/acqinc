# RQV2 Kudos undo patch
# Run from the repository root: python3 tools/apply_undo_kudos.py
from pathlib import Path
p=Path("rq-v2-integration-i1/index.html")
s=p.read_text()
old="if(k.afterPhotoId){const b=el('button','secondary','View after');b.onclick=()=>showPhoto(k.afterPhotoId);item.append(b)}hist.append(item)});"
new="""if(k.afterPhotoId){const b=el('button','secondary','View after');b.onclick=()=>showPhoto(k.afterPhotoId);item.append(b)}
if(k&&typeof k==='object'&&k.taskId&&tasks.some(t=>t.id===k.taskId&&t.retroactive)){
 const b=el('button','secondary','Undo Kudos');b.type='button';
 b.onclick=()=>{
  const linked=focusSessions.filter(x=>x.taskId===k.taskId);
  if(linked.some(x=>x.e2GoldStatus==='claimed'||x.e2GoldAggregateId)){
   tell('This Kudos already claimed gold; reversal requires a separate gold adjustment.');return;
  }
  if(!confirm('Undo this Kudos and its associated focus minutes?'))return;
  change(()=>{
   kudos=kudos.filter(x=>x!==k);
   focusSessions=focusSessions.filter(x=>x.taskId!==k.taskId);
   tasks=tasks.filter(x=>x.id!==k.taskId);
  },'Kudos and associated focus minutes reversed.');
 };
 item.append(b);
}
hist.append(item)});"""
if s.count(old)!=1:
 raise SystemExit("Expected exactly one insertion point; source unchanged")
p.write_text(s.replace(old,new))
print("Kudos undo patched")

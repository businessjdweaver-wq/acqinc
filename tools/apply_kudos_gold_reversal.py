from pathlib import Path
p=Path("rq-v2-integration-i1/index.html")
s=p.read_text()
old=""" b.onclick=()=>{
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
 };"""
new=""" b.onclick=async()=>{
  const linked=focusSessions.filter(x=>x.taskId===k.taskId);
  if(!linked.length){tell('No focus record linked to this Kudos; no changes made.');return;}
  const claimed=linked.filter(x=>x.e2GoldStatus==='claimed'||x.e2GoldAggregateId);
  const aggregateIds=[...new Set(claimed.map(x=>x.e2GoldAggregateId||x.e2SessionId))];
  if(aggregateIds.length>1){tell('Multiple gold claims linked to this Kudos. Manual reconciliation required.');return;}
  const reverseMs=claimed.reduce((n,x)=>n+Math.max(0,Number(x.e2GoldRedeemedMs??x.ms??0)),0);
  if(claimed.length&&(!aggregateIds[0]||!Number.isSafeInteger(reverseMs)||reverseMs<6000||reverseMs%6000!==0)){tell('Gold evidence is incomplete; no changes made.');return;}
  if(!confirm('Undo this Kudos, remove its focus minutes'+(claimed.length?', and reverse '+(reverseMs/6000)+' gold':'')+'?'))return;
  b.disabled=true;
  try{
   if(claimed.length){
    await signedUser();
    const key='rq_v2_kudos_reversal_'+aggregateIds[0]+'_'+k.taskId;
    let reversalId=localStorage.getItem(key);
    if(!reversalId){reversalId=crypto.randomUUID();localStorage.setItem(key,reversalId);}
    const {error}=await client().schema('rq_v2').rpc('reverse_focus_gold',{p_session_id:aggregateIds[0],p_reversal_id:reversalId,p_reverse_ms:reverseMs});
    if(error)throw Error(error.message);
   }
   change(()=>{
    kudos=kudos.filter(x=>x!==k);
    focusSessions=focusSessions.filter(x=>x.taskId!==k.taskId);
    tasks=tasks.filter(x=>x.id!==k.taskId);
   },'Kudos, focus minutes, and claimed gold reversed.');
   if(claimed.length)await e1LoadBalances();
  }catch(err){tell('Kudos reversal not completed: '+err.message);b.disabled=false;}
 };"""
if s.count(old)!=1: raise SystemExit("Patch anchor changed; stop")
p.write_text(s.replace(old,new))
print("Installed transactional Kudos reversal client")

/* Relentless Quest Training Hall contract importer v0.1.11
   Loads pending workout-completion rewards from Supabase and local fallback,
   converts them into normal Contracts-screen tasks. Kept outside main app. */
(function(){
  'use strict';
  var BUSY=false;
  var LOCAL_KEY='rq_training_pending_contracts_v1';
  var LAST_RESULT={at:null, ready:false, imported:0, localRows:0, remoteRows:0, error:null};
  function ready(){return window.S&&Array.isArray(S.active);}
  function readyReason(){if(!window.S)return 'S state object unavailable'; if(!Array.isArray(S.active))return 'S.active contracts array unavailable'; if(typeof uid!=='function')return 'uid() helper unavailable'; if(!uid())return 'uid() empty; local fallback can still import, remote lookup will wait'; return 'ready';}
  function hasSupabase(){return typeof SB_URL!=='undefined'&&typeof sbHeaders==='function';}
  function taskId(){return 'tfit'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function makeTask(row){
    var sid=row.source_session_id||row.id;
    var mins=Math.max(1,Math.round((row.duration_sec||0)/60));
    return {
      _tid:taskId(),
      name:row.title||('🏋️ Completed Workout — '+mins+' min'),
      gp:Math.max(1,Math.min(100,parseInt(row.gp,10)||25)),
      count:0,
      pct:0,
      subtasks:[],
      collapsed:false,
      fav:false,
      _col:0,
      _reactivatedAt:Date.now(),
      note:'Imported from Training Hall.',
      desc:'Training Hall workout completed. Duration: '+mins+' minutes. Claim this contract to receive the workout reward.',
      _trainingSessionId:sid,
      _trainingContractId:row.id||null,
      _trainingLocalQueuedAt:row.localQueuedAt||null,
      _trainingImportedAt:new Date().toISOString()
    };
  }
  function loadLocalRows(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')||[];}catch(e){return [];}}
  function saveLocalRows(rows){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(rows||[]));}catch(e){}}
  function persistAndRender(){
    try{ if(typeof ensureTaskIds==='function')ensureTaskIds(); }catch(e){}
    try{ if(typeof save==='function')save(); else if(typeof saveLocalState==='function')saveLocalState(); }catch(e){}
    try{ if(typeof renderTasks==='function')renderTasks(); }catch(e){}
    try{ if(typeof _markUnpushed==='function')_markUnpushed(); }catch(e){}
    try{ if(typeof sbPush==='function')setTimeout(function(){sbPush(false);},600); }catch(e){}
    try{ if(typeof sbPush==='function')setTimeout(function(){sbPush(false);},3000); }catch(e){}
  }
  function importRows(rows, source){
    rows=rows||[];
    var imported=[];
    rows.forEach(function(row){
      var sid=row.source_session_id||row.id;
      if(!sid)return;
      var dup=(S.active||[]).some(function(t){return t&&String(t._trainingSessionId)===String(sid);});
      if(dup){imported.push({id:row.id, source_session_id:sid, contract_tid:null, duplicate:true, source:source});return;}
      var t=makeTask(row);
      S.active.unshift(t);
      imported.push({id:row.id, source_session_id:sid, contract_tid:t._tid, duplicate:false, source:source});
      try{ if(typeof logAdd==='function')logAdd('Training contract added: "'+t.name+'"','task'); }catch(e){}
    });
    if(imported.some(function(x){return !x.duplicate;}))persistAndRender();
    return imported;
  }
  function markSupabaseImported(imported){
    if(!hasSupabase())return Promise.resolve();
    return Promise.all((imported||[]).filter(function(x){return x.id;}).map(function(x){
      return fetch(SB_URL+'/rest/v1/rq_training_contracts?id=eq.'+encodeURIComponent(x.id),{
        method:'PATCH',headers:Object.assign({},sbHeaders(),{Prefer:'return=minimal'}),
        body:JSON.stringify({status:x.duplicate?'duplicate':'imported',contract_tid:x.contract_tid,imported_at:new Date().toISOString()})
      }).catch(function(err){console.warn('[RQ Training importer mark]',err);});
    }));
  }
  function importLocalFallback(){
    var rows=loadLocalRows();
    LAST_RESULT.localRows=rows.length;
    if(!rows.length)return [];
    var imported=importRows(rows,'local');
    var importedSids=new Set(imported.map(function(x){return String(x.source_session_id); }));
    saveLocalRows(rows.filter(function(r){return !importedSids.has(String(r.source_session_id||r.id));}));
    return imported;
  }
  function fetchRemotePending(){
    if(!hasSupabase()||typeof uid!=='function'||!uid())return Promise.resolve([]);
    var u=uid();
    var q='user_id=eq.'+encodeURIComponent(u)+'&status=eq.pending&select=*';
    if(typeof sbGet==='function')return sbGet('rq_training_contracts',q).then(function(rows){return Array.isArray(rows)?rows:[];});
    return fetch(SB_URL+'/rest/v1/rq_training_contracts?'+q,{headers:sbHeaders()})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error((d&&(d.message||d.error))||r.statusText);return Array.isArray(d)?d:[];});});
  }
  function importPendingTrainingContracts(manual){
    LAST_RESULT={at:new Date().toISOString(),ready:ready(),imported:0,localRows:0,remoteRows:0,error:null};
    if(BUSY||!ready()){ if(manual)alert('Training import is not ready yet. Open Contracts after the app finishes loading, then try again.'); return Promise.resolve(false); }
    BUSY=true;
    var allImported=[];
    return fetchRemotePending()
      .then(function(rows){
        LAST_RESULT.remoteRows=rows.length;
        allImported=allImported.concat(importRows(rows,'supabase'));
        return markSupabaseImported(allImported);
      })
      .catch(function(e){LAST_RESULT.error=e&&e.message||String(e); console.warn('[RQ Training importer supabase]',e);})
      .then(function(){
        allImported=allImported.concat(importLocalFallback());
        LAST_RESULT.imported=allImported.filter(function(x){return x&&!x.duplicate;}).length;
        if(manual){
          alert('Training import check complete. Remote pending: '+LAST_RESULT.remoteRows+'; local queued: '+LAST_RESULT.localRows+'; new contracts added: '+LAST_RESULT.imported+(LAST_RESULT.error?('\nError: '+LAST_RESULT.error):''));
        }
        return !!allImported.length;
      })
      .finally(function(){BUSY=false;});
  }
  window.RQ_IMPORT_TRAINING_CONTRACTS=importPendingTrainingContracts;
  window.RQ_TRAINING_IMPORT_STATUS=function(){
    return Object.assign({},LAST_RESULT,{readyNow:ready(),readyReason:readyReason(),localRowsNow:loadLocalRows().length, activeTrainingContracts:(S&&S.active||[]).filter(function(t){return t&&t._trainingSessionId;}).map(function(t){return {name:t.name,gp:t.gp,session:t._trainingSessionId};})});
  };
  function schedule(delay){setTimeout(function(){importPendingTrainingContracts(false);},delay||800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){schedule(1800);}); else schedule(1800);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule(400);});
  window.addEventListener('focus',function(){schedule(250);});
  document.addEventListener('click',function(){schedule(600);},{capture:true,passive:true});
  setInterval(function(){schedule(0);},30000);
})();

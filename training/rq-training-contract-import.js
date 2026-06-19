/* Relentless Quest Training Hall contract importer v0.1.8
   Loads pending workout-completion rewards from Supabase and local fallback,
   converts them into normal Contracts-screen tasks. Kept outside main app. */
(function(){
  'use strict';
  var BUSY=false;
  var LOCAL_KEY='rq_training_pending_contracts_v1';
  function ready(){return typeof uid==='function'&&uid()&&typeof sbHeaders==='function'&&typeof SB_URL!=='undefined'&&window.S&&Array.isArray(S.active);}
  function taskId(){return 'tfit'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function makeTask(row){
    var sid=row.source_session_id||row.id;
    var mins=Math.max(1,Math.round((row.duration_sec||0)/60));
    return {
      _tid:taskId(),
      name:row.title||('🏋️ Completed Workout — '+mins+' min'),
      gp:Math.max(1,Math.min(100,parseInt(row.gp,10)||25)),
      count:0,
      subtasks:[],
      collapsed:false,
      _col:0,
      desc:'Training Hall workout completed. Duration: '+mins+' minutes. Claim this contract to receive the workout reward.',
      _trainingSessionId:sid,
      _trainingContractId:row.id||null,
      _trainingLocalQueuedAt:row.localQueuedAt||null
    };
  }
  function loadLocalRows(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]')||[];}catch(e){return [];}}
  function saveLocalRows(rows){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(rows||[]));}catch(e){}}
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
    if(imported.some(function(x){return !x.duplicate;})){
      try{ if(typeof save==='function')save(); }catch(e){}
      try{ if(typeof renderTasks==='function')renderTasks(); }catch(e){}
      try{ if(typeof sbPush==='function')setTimeout(function(){sbPush(false);},250); }catch(e){}
    }
    return imported;
  }
  function markSupabaseImported(imported){
    return Promise.all((imported||[]).filter(function(x){return x.id;}).map(function(x){
      return fetch(SB_URL+'/rest/v1/rq_training_contracts?id=eq.'+encodeURIComponent(x.id),{
        method:'PATCH',headers:Object.assign({},sbHeaders(),{Prefer:'return=minimal'}),
        body:JSON.stringify({status:x.duplicate?'duplicate':'imported',contract_tid:x.contract_tid,imported_at:new Date().toISOString()})
      }).catch(function(){});
    }));
  }
  function importLocalFallback(){
    var rows=loadLocalRows();
    if(!rows.length)return [];
    var imported=importRows(rows,'local');
    var importedSids=new Set(imported.map(function(x){return String(x.source_session_id);}));
    saveLocalRows(rows.filter(function(r){return !importedSids.has(String(r.source_session_id||r.id));}));
    return imported;
  }
  function importPendingTrainingContracts(manual){
    if(BUSY||!ready())return Promise.resolve(false); BUSY=true;
    var u=uid();
    var allImported=[];
    return fetch(SB_URL+'/rest/v1/rq_training_contracts?user_id=eq.'+encodeURIComponent(u)+'&status=eq.pending&select=*', {headers:sbHeaders()})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error((d&&(d.message||d.error))||r.statusText);return d||[];});})
      .then(function(rows){
        allImported=allImported.concat(importRows(rows,'supabase'));
        return markSupabaseImported(allImported);
      })
      .catch(function(e){console.warn('[RQ Training importer supabase]',e);})
      .then(function(){
        allImported=allImported.concat(importLocalFallback());
        if(manual&&allImported.length)alert('Imported '+allImported.length+' Training Hall contract(s).');
        return !!allImported.length;
      })
      .finally(function(){BUSY=false;});
  }
  window.RQ_IMPORT_TRAINING_CONTRACTS=importPendingTrainingContracts;
  function schedule(delay){setTimeout(function(){importPendingTrainingContracts(false);},delay||800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){schedule(1200);}); else schedule(1200);
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule(400);});
  window.addEventListener('focus',function(){schedule(250);});
  document.addEventListener('click',function(){schedule(600);},{capture:true,passive:true});
})();

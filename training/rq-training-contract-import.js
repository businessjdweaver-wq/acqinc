/* Relentless Quest Training Hall contract importer v0.1.3
   Loads pending workout-completion rewards from rq_training_contracts and
   converts them into normal Contracts-screen tasks. Kept outside the main app
   so future Training Hall updates can target /training only. */
(function(){
  'use strict';
  var BUSY=false;
  function ready(){return typeof uid==='function'&&uid()&&typeof sbHeaders==='function'&&typeof SB_URL!=='undefined'&&window.S&&Array.isArray(S.active);}
  function taskId(){return 'tfit'+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function importPendingTrainingContracts(manual){
    if(BUSY||!ready())return Promise.resolve(false); BUSY=true;
    var u=uid();
    return fetch(SB_URL+'/rest/v1/rq_training_contracts?user_id=eq.'+encodeURIComponent(u)+'&status=eq.pending&select=*', {headers:sbHeaders()})
      .then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error((d&&(d.message||d.error))||r.statusText);return d||[];});})
      .then(function(rows){
        if(!rows.length)return false;
        var imported=[];
        rows.forEach(function(row){
          var sid=row.source_session_id||row.id;
          var dup=(S.active||[]).some(function(t){return t&&t._trainingSessionId===sid;});
          if(dup){imported.push({id:row.id, contract_tid:null, duplicate:true});return;}
          var mins=Math.max(1,Math.round((row.duration_sec||0)/60));
          var t={
            _tid:taskId(),
            name:row.title||('🏋️ Completed Workout — '+mins+' min'),
            gp:Math.max(1,Math.min(100,parseInt(row.gp,10)||25)),
            count:0,
            subtasks:[],
            collapsed:false,
            _col:0,
            desc:'Training Hall workout completed. Duration: '+mins+' minutes. Claim this contract to receive the workout reward.',
            _trainingSessionId:sid,
            _trainingContractId:row.id
          };
          S.active.unshift(t);
          imported.push({id:row.id, contract_tid:t._tid, duplicate:false});
          try{ if(typeof logAdd==='function')logAdd('Training contract added: "'+t.name+'"','task'); }catch(e){}
        });
        if(imported.some(function(x){return !x.duplicate;})){
          try{ if(typeof save==='function')save(); }catch(e){}
          try{ if(typeof renderTasks==='function')renderTasks(); }catch(e){}
          try{ if(typeof sbPush==='function')setTimeout(function(){sbPush(false);},250); }catch(e){}
        }
        return Promise.all(imported.map(function(x){
          return fetch(SB_URL+'/rest/v1/rq_training_contracts?id=eq.'+encodeURIComponent(x.id),{
            method:'PATCH',headers:Object.assign({},sbHeaders(),{Prefer:'return=minimal'}),
            body:JSON.stringify({status:x.duplicate?'duplicate':'imported',contract_tid:x.contract_tid,imported_at:new Date().toISOString()})
          }).catch(function(){});
        })).then(function(){
          if(manual&&imported.length)alert('Imported '+imported.length+' Training Hall contract(s).');
          return true;
        });
      }).catch(function(e){console.warn('[RQ Training importer]',e);return false;}).finally(function(){BUSY=false;});
  }
  window.RQ_IMPORT_TRAINING_CONTRACTS=importPendingTrainingContracts;
  function schedule(){setTimeout(function(){importPendingTrainingContracts(false);},1800);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule); else schedule();
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')schedule();});
})();

/* Relentless Quest V2 — bounded, deterministic event dispatcher (UMD). No network or persistence. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQPowerEvents=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const MODES=['activated','passive','reaction','scheduled'];
function matches(rule,event){
 if(!rule||!event||!MODES.includes(rule.mode))return false;
 if(rule.mode==='activated')return event.type==='manual'&&rule.event==='manual';
 return rule.event===event.type&&(rule.subject==='either-team'||rule.subject===event.subject)&&(rule.condition==='any'||rule.condition===event.condition);
}
function createDispatcher({maxDepth=8,maxEvents=128,onEffect=()=>{}}={}){
 if(!Number.isInteger(maxDepth)||maxDepth<1||maxDepth>32||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>1024)throw Error('Invalid event bounds');
 const rules=[],seen=new Set(),queue=[],history=[];let sequence=0,processing=false,turn=1,round=1,encounter=1;
 function add(id,rule){if(!id||rules.some(x=>x.id===id))throw Error('Duplicate/empty rule id');rules.push({id,rule});}
 function scope(id,limit,event){if(limit==='once-per-encounter')return id+':enc:'+encounter;if(limit==='once-per-round')return id+':round:'+round;if(limit==='once-per-turn')return id+':turn:'+turn;return id+':event:'+event.id;}
 function emit(event,depth=0){if(!event||typeof event.type!=='string')throw Error('Invalid event');if(queue.length+history.length>=maxEvents)throw Error('Event budget exceeded');queue.push({...event,id:++sequence,depth});if(!processing)flush();}
 function flush(){processing=true;try{while(queue.length){const event=queue.shift();if(event.depth>maxDepth){history.push({event,skipped:'depth-limit'});continue;}const fired=[];for(const {id,rule} of rules){if(!matches(rule,event))continue;const key=scope(id,rule.limit,event);if(seen.has(key))continue;seen.add(key);fired.push(id);onEffect({id,rule,event,emit:next=>emit(next,event.depth+1)});}history.push({event,fired});if(history.length>=maxEvents&&queue.length){queue.length=0;history.push({skipped:'event-limit'});break;}}}finally{processing=false;}}
 function advanceTurn(){turn++;}function advanceRound(){round++;}function newEncounter(){encounter++;turn=1;round=1;seen.clear();history.length=0;queue.length=0;sequence=0;}
 return{add,emit,advanceTurn,advanceRound,newEncounter,history,scope:()=>({turn,round,encounter})};
}
return{matches,createDispatcher};
});

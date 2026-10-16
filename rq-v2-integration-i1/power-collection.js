(function(root){'use strict';
const KEY='rq-v2-power-collection-v1',GOLD='rq-v2-power-collection-gold-v1',DAY=86400000;
const catalog=()=>root.RQCharacterCatalog?.characters||[];
const uid=()=>('pc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9));
function seed(){const roster=catalog().map((c,i)=>({id:i,level:1,unlocked:i<3,powers:i<3?[0]:[]}));return {version:1,gold:0,roster,inbox:[],history:[]};}
function read(){let s;try{s=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}if(!s||s.version!==1||!Array.isArray(s.roster)||!Array.isArray(s.inbox))s=seed();return s;}
function write(s){localStorage.setItem(KEY,JSON.stringify(s));return s;}
function expire(s,now=Date.now()){let count=0;for(const c of s.inbox.slice()){if(c.expiresAt!==null&&Number.isFinite(c.expiresAt)&&c.expiresAt<=now){s.gold+=c.goldValue||25;s.inbox.splice(s.inbox.indexOf(c),1);s.history.push({type:'expired',character:c.character,slot:c.slot,gold:c.goldValue||25,time:now});count++;}}if(count)write(s);return count;}
function receive(character,slot,days=14,goldValue=25){if(!catalog()[character]?.powers?.[slot])throw Error('Unknown power card');const s=read();expire(s);const c={id:uid(),character,slot,level:1,receivedAt:Date.now(),expiresAt:days===null?null:Date.now()+Math.max(1,days)*DAY,goldValue};s.inbox.push(c);write(s);return c;}
function recruit(cardId){const s=read();expire(s);const i=s.inbox.findIndex(c=>c.id===cardId);if(i<0)throw Error('Card unavailable or expired');const c=s.inbox[i],r=s.roster[c.character];if(!r)throw Error('Unknown background');r.unlocked=true;r.powers=r.powers||[];if(r.powers.includes(c.slot)){s.gold+=c.goldValue||25;s.history.push({type:'duplicate',character:c.character,slot:c.slot,time:Date.now()});}else r.powers.push(c.slot);s.inbox.splice(i,1);write(s);return r;}
function liquidate(cardId){const s=read();expire(s);const i=s.inbox.findIndex(c=>c.id===cardId);if(i<0)throw Error('Card unavailable');const c=s.inbox.splice(i,1)[0];s.gold+=c.goldValue||25;write(s);return s.gold;}
function upgradeCharacter(i){const s=read(),r=s.roster[i];if(!r?.unlocked)throw Error('Character not recruited');r.level=Math.min(99,(r.level||1)+1);write(s);return r.level;}
root.RQPowerCollection={key:KEY,read,write,expire,receive,recruit,liquidate,upgradeCharacter,seed};
})(window);
/* In-memory tile manipulation, no network/storage. Row-major board. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RQTileManipulation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
function createBoard(width,height,cells){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>400||!Array.isArray(cells)||cells.length!==width*height)throw Error('Invalid board');
 const board=cells.map(c=>c?{...c}:null),at=(x,y)=>y*width+x;
 function tile(x,y){return board[at(x,y)]}
 function lock(x,y){if(!tile(x,y))throw Error('No tile');board[at(x,y)].locked=true}
 function unlock(x,y){if(tile(x,y))board[at(x,y)].locked=false}
 function gravity(){
  for(let x=0;x<width;x++){let write=height-1;for(let y=height-1;y>=0;y--){const c=tile(x,y);if(!c)continue;if(c.locked)continue;while(write>=0&&tile(x,write)?.locked)write--;if(write<0)throw Error('Gravity invariant');if(write!==y){board[at(x,write)]=c;board[at(x,y)]=null}write--}}
  return board;
 }
 function fortify(x,y){const c=tile(x,y);if(!c)throw Error('No tile');c.fortified=true}
 function destroy(x,y,{bonus=false}={}){const c=tile(x,y);if(!c)return 'empty';if(c.fortified){c.fortified=false;return 'defortified'}board[at(x,y)]=null;return 'destroyed'}
 function strength(x,y,operation,value,{percent=false}={}){const c=tile(x,y);if(!c||!c.special)throw Error('Not a special tile');if(!['amplify','dampen'].includes(operation)||!Number.isFinite(value)||value<0)throw Error('Invalid modifier');const amount=percent?Math.round(c.strength*value/100):value;c.strength=Math.max(0,c.strength+(operation==='amplify'?amount:-amount));return c.strength}
 function move(x,y,toX,toY){if([x,y,toX,toY].some(v=>!Number.isInteger(v))||[x,toX].some(v=>v<0||v>=width)||[y,toY].some(v=>v<0||v>=height))throw Error('Out of bounds');const from=at(x,y),to=at(toX,toY);if(!board[from]||board[from].locked||board[to]?.locked)throw Error('Cannot move locked tile');[board[from],board[to]]=[board[to],board[from]];return board[to]}
 return{tile,lock,unlock,gravity,fortify,destroy,strength,move,snapshot:()=>board.map(c=>c?{...c}:null)};
}
return{createBoard};
});

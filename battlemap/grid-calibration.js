/* Battlemap Studio square-grid calibration, v1.401. Pure solver, no DOM or scene mutation. */
(function(global){
'use strict';
function solveSquareGridCalibration(marks,across,down,column,row,multiplier){
 const n=marks.length;
 if(n<3||![across,down,column,row].every(Number.isInteger)||across<1||down<1||column<0||row<0||!Number.isFinite(multiplier)||multiplier<=0)return {error:'Enter at least three intersections and valid square interval counts.'};
 const u=across*multiplier,v=down*multiplier;
 const a=marks[0],b=marks[1],d=marks[2];
 const right=[(b[0]-a[0])/u,(b[1]-a[1])/u];
 const downVec=[(d[0]-a[0])/v,(d[1]-a[1])/v];
 const firstScale=Math.hypot(...right),secondScale=Math.hypot(...downVec);
 if(firstScale<.02||secondScale<.02)return {error:'First three intersections are too close together.'};
 if(right[0]*downVec[1]-right[1]*downVec[0]<=0)return {error:'Choose point 1, then a point to its right, then one below point 1.'};
 const initialAngle=Math.atan2(right[1]-downVec[0],right[0]+downVec[1]);
 const initialScale=(firstScale+secondScale)/2;
 const fixed=[{p:a,u:0,v:0},{p:b,u,v:0},{p:d,u:0,v}];
 const later=[];
 for(let i=3;i<n;i++){
  const dx=marks[i][0]-a[0],dy=marks[i][1]-a[1];
  const gx=(dx*Math.cos(initialAngle)+dy*Math.sin(initialAngle))/initialScale;
  const gy=(-dx*Math.sin(initialAngle)+dy*Math.cos(initialAngle))/initialScale;
  const cu=Math.round(gx/multiplier)*multiplier,cv=Math.round(gy/multiplier)*multiplier;
  const residual=Math.hypot(gx-cu,gy-cv);
  if(residual<=.30*multiplier)later.push({p:marks[i],u:cu,v:cv});
 }
 const observations=[...fixed,...later];
 const count=observations.length;
 const mu=observations.reduce((sum,t)=>sum+t.u,0)/count;
 const mv=observations.reduce((sum,t)=>sum+t.v,0)/count;
 const mx=observations.reduce((sum,t)=>sum+t.p[0],0)/count;
 const my=observations.reduce((sum,t)=>sum+t.p[1],0)/count;
 let dot=0,rot=0,denom=0;
 for(const t of observations){
  const du=t.u-mu,dv=t.v-mv,dx=t.p[0]-mx,dy=t.p[1]-my;
  dot+=du*dx+dv*dy;rot+=du*dy-dv*dx;denom+=du*du+dv*dv;
 }
 if(denom<1e-8)return {error:'Points do not span a usable grid.'};
 const xx=dot/denom,xy=rot/denom,yx=-xy,yy=xx;
 const scale=Math.hypot(xx,xy);
 if(!Number.isFinite(scale)||scale<.02)return {error:'Calculated cell size is invalid.'};
 const baseX=mx-xx*mu-yx*mv,baseY=my-xy*mu-yy*mv;
 const indexColumn=column*multiplier,indexRow=row*multiplier;
 const calibration={ox:baseX-xx*indexColumn-yx*indexRow,oy:baseY-xy*indexColumn-yy*indexRow,xx,xy,yx,yy};
 const errors=observations.map(t=>Math.hypot(baseX+xx*t.u+yx*t.v-t.p[0],baseY+xy*t.u+yy*t.v-t.p[1])/scale);
 const rms=Math.sqrt(errors.reduce((sum,e)=>sum+e*e,0)/count),max=Math.max(...errors);
 return {calibration,count,ignored:n-3-later.length,scale,rotation:Math.atan2(xy,xx)*180/Math.PI,rms,max};
}
global.BattlemapGridCalibration=Object.freeze({solve:solveSquareGridCalibration,version:'1.401'});
})(window);

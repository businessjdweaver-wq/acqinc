/* Battlemap Studio square-grid calibration, v1.404. */
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
  if(Math.hypot(gx-cu,gy-cv)<=.30*multiplier)later.push({p:marks[i],u:cu,v:cv});
 }
 const observations=[...fixed,...later],count=observations.length;
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
 const indexColumn=0,indexRow=0; // The first selected intersection defines the local grid anchor.
 const calibration={ox:baseX-xx*indexColumn-yx*indexRow,oy:baseY-xy*indexColumn-yy*indexRow,xx,xy,yx,yy};
 const errors=observations.map(t=>Math.hypot(baseX+xx*t.u+yx*t.v-t.p[0],baseY+xy*t.u+yy*t.v-t.p[1])/scale);
 const rms=Math.sqrt(errors.reduce((sum,e)=>sum+e*e,0)/count),max=Math.max(...errors);
 return {calibration,count,ignored:n-3-later.length,scale,rotation:Math.atan2(xy,xx)*180/Math.PI,rms,max};
}
function renderOverlay(env){
 const {el,readFloorImageSettings,rawPoint,gridDisplayValue,gridColor,gridOpacity,activeGridCalibration,floorSceneMarks,floorScenePendingCalibration,floorGridCalibrationDraft}=env;
 const {W,H,devicePixelRatio,floorSceneEditing}=env;
 if(!floorSceneEditing)return;
 const overlay=el('floorSceneOverlay'),rect=overlay.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
 if(!rect.width||!rect.height)return;
 overlay.width=Math.round(rect.width*ratio);overlay.height=Math.round(rect.height*ratio);
 const g=overlay.getContext('2d');g.setTransform(ratio*rect.width/W,0,0,ratio*rect.height/H,0,0);
 const {x,y,width,depth,rotation}=readFloorImageSettings();
 if(![x,y,width,depth,rotation].every(Number.isFinite))return;
 const a=rotation*Math.PI/180,c=Math.cos(a),si=Math.sin(a);
 const corners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>rawPoint((x+u*width*c-v*depth*si)/5,(y+u*width*si+v*depth*c)/5,0));
 g.setLineDash([7,5]);g.lineWidth=2;g.strokeStyle='#ffd677';g.beginPath();corners.forEach(([px,py],i)=>i?g.lineTo(px,py):g.moveTo(px,py));g.closePath();g.stroke();g.setLineDash([]);
 // Eight direct-manipulation handles. The outline and handles use the
 // exact image transform; calibration never changes that transform.
 if(env.floorSceneMode!=='align'){
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const handles=[corners[0],mid(corners[0],corners[1]),corners[1],mid(corners[1],corners[2]),corners[2],mid(corners[2],corners[3]),corners[3],mid(corners[3],corners[0])];
  g.fillStyle='#fff9dd';g.strokeStyle='#123d4a';g.lineWidth=1.5;
  handles.forEach(([hx,hy])=>{g.beginPath();g.rect(hx-6,hy-6,12,12);g.fill();g.stroke()});
  overlay.dataset.floorHandles=JSON.stringify(handles);
 }else delete overlay.dataset.floorHandles;
 if(el('floorSceneGrid').getAttribute('aria-pressed')==='true'&&gridDisplayValue().visible!==false){
  g.lineWidth=1;g.strokeStyle=gridColor();g.globalAlpha=gridOpacity();g.beginPath();
  const calibration=floorScenePendingCalibration||floorGridCalibrationDraft||activeGridCalibration();
  const previewToWorld=(gx,gy)=>calibration?[calibration.ox+calibration.xx*gx+calibration.yx*gy,calibration.oy+calibration.xy*gx+calibration.yy*gy]:[gx,gy];
  const previewFromWorld=(wx,wy)=>{if(!calibration)return [wx,wy];const det=calibration.xx*calibration.yy-calibration.xy*calibration.yx,dx=wx-calibration.ox,dy=wy-calibration.oy;return [(dx*calibration.yy-dy*calibration.yx)/det,(dy*calibration.xx-dx*calibration.xy)/det]};
  const previewPoint=(gx,gy)=>rawPoint(...previewToWorld(gx,gy),0);
  const screenOrigin=previewPoint(0,0),screenRight=previewPoint(1,0),screenDown=previewPoint(0,1);
  const screenWidth=Math.hypot(screenRight[0]-screenOrigin[0],screenRight[1]-screenOrigin[1]);
  const screenHeight=Math.hypot(screenDown[0]-screenOrigin[0],screenDown[1]-screenOrigin[1]);
  overlay.dataset.gridCellPixels=`${screenWidth.toFixed(2)} × ${screenHeight.toFixed(2)} px`;
  overlay.dataset.gridCellRatio=(screenWidth/Math.max(.00001,screenHeight)).toFixed(5);
  const imageCorners=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].map(([u,v])=>
   previewFromWorld((x+u*width*c-v*depth*si)/5,(y+u*width*si+v*depth*c)/5));
  const xs=imageCorners.map(p=>p[0]),ys=imageCorners.map(p=>p[1]);
  const loX=Math.floor(Math.min(...xs))-1,hiX=Math.ceil(Math.max(...xs))+1;
  const loY=Math.floor(Math.min(...ys))-1,hiY=Math.ceil(Math.max(...ys))+1;
  g.save();g.beginPath();corners.forEach(([px,py],i)=>i?g.lineTo(px,py):g.moveTo(px,py));g.closePath();g.clip();
  const stride=Math.max(1,Math.ceil(Math.max(hiX-loX,hiY-loY)/400));
  for(let i=loX;i<=hiX;i+=stride){const p=previewPoint(i,loY),q=previewPoint(i,hiY);g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1])}
  for(let i=loY;i<=hiY;i+=stride){const p=previewPoint(loX,i),q=previewPoint(hiX,i);g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1])}
  g.stroke();g.restore();g.globalAlpha=1;
 }
 g.fillStyle='#fff0a0';g.strokeStyle='#172028';
 floorSceneMarks.forEach((p,i)=>{const [px,py]=rawPoint(p[0],p[1],0);g.beginPath();g.arc(px,py,8,0,Math.PI*2);g.fill();g.stroke();g.font='bold 11px system-ui';g.fillStyle='#172028';g.textAlign='center';g.textBaseline='middle';g.fillText(String(i+1),px,py);g.fillStyle='#fff0a0'});
}
function refineCalibration(env){
 const {el,floorSceneMarks,draw,movementRenderCacheSetter}=env;
 const marks=floorSceneMarks,n=marks.length;
 const [across,down]=['floorGridAcross','floorGridDown'].map(id=>el(id).valueAsNumber);
 const multiplier=Number(el('floorPrintedFeet').value)/5;
 const result=global.BattlemapGridCalibration?.solve(marks,across,down,0,0,multiplier);
 if(!result||result.error){el('floorAlignStatus').textContent=result?.error||'Calibration module did not load. Reload the page and try again.';return;}
 env.setPendingCalibration(result.calibration);
 const {count,ignored,scale,rotation,rms,max}=result;
 el('floorSceneAccept').hidden=false;el('floorSceneRetry').hidden=false;
 const quality=max>.35?'WARNING: selected intersections do not agree closely. ':'';
 const next=n<9?'You may add another intersection or accept now.':'All nine points collected.';
 el('floorAlignStatus').textContent=`${n}/9 clicked · ${count} used${ignored?` (${ignored} ambiguous additional point${ignored===1?'':'s'} ignored)`:''} · ${across} horizontal and ${down} vertical square intervals · square cell ${scale.toFixed(3)} world units · rotation ${rotation.toFixed(2)}° · RMS ${rms.toFixed(2)} cells · max ${max.toFixed(2)} cells. ${quality}${next}`;
 movementRenderCacheSetter();draw('Square VTT calibration preview');
}
global.BattlemapGridCalibration=Object.freeze({solve:solveSquareGridCalibration,renderOverlay,refineCalibration,version:'1.408'});
})(window);

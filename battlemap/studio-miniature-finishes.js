// Baked fields for STL triangle soup. Welding is local to the analysis, so
// face numbering, flat normals and paint coordinates remain those of the import.
const STUDIO_FINISH_MAX_TRIANGLES=120000;
const STUDIO_FINISH_AO_RADIUS=.14;
const STUDIO_FINISH_CURVATURE_RADIUS=.035;
const STUDIO_FINISH_AO_SAMPLES=10;

function prepareStudioFinishMesh(positions,indices){
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){
  const axis=i%3;
  min[axis]=Math.min(min[axis],positions[i]);
  max[axis]=Math.max(max[axis],positions[i]);
 }
 const span=Math.max(max[0]-min[0],max[1]-min[1],max[2]-min[2]);
 if(!(span>0&&Number.isFinite(span)))return null;
 const vertexCount=positions.length/3,welded=new Uint32Array(vertexCount);
 const points=new Float32Array(positions.length),byPosition=new Map();
 // A fixed numeric key avoids string allocation while keeping all its digits
 // within the safe integer range.
 const subdivisions=100000,stride=subdivisions+1;
 let count=0;
 for(let i=0;i<vertexCount;i++){
  const x=(positions[i*3]-min[0])/span,y=(positions[i*3+1]-min[1])/span,z=(positions[i*3+2]-min[2])/span;
  const key=(Math.round(x*subdivisions)*stride+Math.round(y*subdivisions))*stride+Math.round(z*subdivisions);
  let id=byPosition.get(key);
  if(id===undefined){
   id=count++;
   byPosition.set(key,id);
   points[id*3]=x;points[id*3+1]=y;points[id*3+2]=z;
  }
  welded[i]=id;
 }
 const faces=Uint32Array.from(indices,index=>welded[index]);
 return {points,welded,faces,count};
}

function measureStudioFinishMesh({points,faces,count}){
 const faceCount=faces.length/3;
 const faceNormals=new Float32Array(faces.length),normals=new Float32Array(count*3);
 const areas=new Float32Array(count),bounds=new Float32Array(faceCount*9),order=[];
 let totalArea=0;
 for(let f=0;f<faceCount;f++){
  const i=f*3,a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
  const ax=points[a],ay=points[a+1],az=points[a+2];
  const bx=points[b],by=points[b+1],bz=points[b+2];
  const cx=points[c],cy=points[c+1],cz=points[c+2];
  const ux=bx-ax,uy=by-ay,uz=bz-az,vx=cx-ax,vy=cy-ay,vz=cz-az;
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  const area=Math.hypot(nx,ny,nz);
  if(area<1e-12)continue;
  totalArea+=area/2;
  faceNormals[i]=nx/area;faceNormals[i+1]=ny/area;faceNormals[i+2]=nz/area;
  for(let corner=0;corner<3;corner++){
   const v=faces[i+corner];
   normals[v*3]+=nx;normals[v*3+1]+=ny;normals[v*3+2]+=nz;
   areas[v]+=area/6;
  }
  const j=f*9;
  bounds[j]=Math.min(ax,bx,cx);bounds[j+1]=Math.min(ay,by,cy);bounds[j+2]=Math.min(az,bz,cz);
  bounds[j+3]=Math.max(ax,bx,cx);bounds[j+4]=Math.max(ay,by,cy);bounds[j+5]=Math.max(az,bz,cz);
  bounds[j+6]=(ax+bx+cx)/3;bounds[j+7]=(ay+by+cy)/3;bounds[j+8]=(az+bz+cz)/3;
  order.push(f);
 }
 for(let i=0;i<normals.length;i+=3){
  const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);
  if(length>1e-12){normals[i]/=length;normals[i+1]/=length;normals[i+2]/=length;}
 }
 return {faceNormals,normals,areas,bounds,order,totalArea};
}

function buildStudioFinishTree(bounds,order){
 function split(start,end,depth){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const centerMin=[Infinity,Infinity,Infinity],centerMax=[-Infinity,-Infinity,-Infinity];
  for(let i=start;i<end;i++){
   const j=order[i]*9;
   for(let axis=0;axis<3;axis++){
    min[axis]=Math.min(min[axis],bounds[j+axis]);
    max[axis]=Math.max(max[axis],bounds[j+3+axis]);
    centerMin[axis]=Math.min(centerMin[axis],bounds[j+6+axis]);
    centerMax[axis]=Math.max(centerMax[axis],bounds[j+6+axis]);
   }
  }
  if(end-start<=8||depth===20)return {min,max,start,end};
  let axis=0;
  for(let i=1;i<3;i++)if(centerMax[i]-centerMin[i]>centerMax[axis]-centerMin[axis])axis=i;
  const plane=(centerMax[axis]+centerMin[axis])/2;
  let middle=start;
  for(let i=start;i<end;i++){
   if(bounds[order[i]*9+6+axis]>=plane)continue;
   const swap=order[middle];order[middle++]=order[i];order[i]=swap;
  }
  if(middle===start||middle===end)middle=(start+end)>>1;
  return {min,max,left:split(start,middle,depth+1),right:split(middle,end,depth+1)};
 }
 return split(0,order.length,0);
}

function studioFinishRayBox(node,origin,direction,inverse,far){
 let near=0;
 for(let axis=0;axis<3;axis++){
  if(!direction[axis]){
   if(origin[axis]<node.min[axis]||origin[axis]>node.max[axis])return Infinity;
   continue;
  }
  const a=(node.min[axis]-origin[axis])*inverse[axis],b=(node.max[axis]-origin[axis])*inverse[axis];
  near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
  if(far<near)return Infinity;
 }
 return near;
}

function studioFinishRayTriangle(points,faces,i,origin,direction,far){
 const a=faces[i]*3,b=faces[i+1]*3,c=faces[i+2]*3;
 const ax=points[a],ay=points[a+1],az=points[a+2];
 const ux=points[b]-ax,uy=points[b+1]-ay,uz=points[b+2]-az;
 const vx=points[c]-ax,vy=points[c+1]-ay,vz=points[c+2]-az;
 const px=direction[1]*vz-direction[2]*vy,py=direction[2]*vx-direction[0]*vz,pz=direction[0]*vy-direction[1]*vx;
 const det=ux*px+uy*py+uz*pz;
 if(Math.abs(det)<1e-12)return far;
 const tx=origin[0]-ax,ty=origin[1]-ay,tz=origin[2]-az;
 const u=(tx*px+ty*py+tz*pz)/det;
 if(u<0||u>1)return far;
 const qx=ty*uz-tz*uy,qy=tz*ux-tx*uz,qz=tx*uy-ty*ux;
 const v=(direction[0]*qx+direction[1]*qy+direction[2]*qz)/det;
 if(v<0||u+v>1)return far;
 const distance=(vx*qx+vy*qy+vz*qz)/det;
 return distance>3e-5?Math.min(far,distance):far;
}

function traceStudioFinishRay(root,points,faces,order,origin,direction){
 const inverse=direction.map(value=>1/value);
 const nodes=[root],distances=[studioFinishRayBox(root,origin,direction,inverse,STUDIO_FINISH_AO_RADIUS)];
 let far=STUDIO_FINISH_AO_RADIUS,nodeBudget=160,faceBudget=256;
 while(nodes.length&&nodeBudget--&&faceBudget){
  const node=nodes.pop(),near=distances.pop();
  if(near>=far)continue;
  if(node.left){
   const left=studioFinishRayBox(node.left,origin,direction,inverse,far);
   const right=studioFinishRayBox(node.right,origin,direction,inverse,far);
   // The stack visits the nearest bounds first so close blockers tighten far.
   if(left<right){
    if(right<far){nodes.push(node.right);distances.push(right);}
    if(left<far){nodes.push(node.left);distances.push(left);}
   }else{
    if(left<far){nodes.push(node.left);distances.push(left);}
    if(right<far){nodes.push(node.right);distances.push(right);}
   }
  }else{
   for(let i=node.start;i<node.end&&faceBudget;i++,faceBudget--){
    far=studioFinishRayTriangle(points,faces,order[i]*3,origin,direction,far);
   }
  }
 }
 return far;
}

function studioFinishFacing(nx,ny,nz){
 const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
 if(ax>=ay&&ax>=az)return nx>=0?0:1;
 if(ay>=az)return ny>=0?2:3;
 return nz>=0?4:5;
}

function studioFinishSampleKey(x,y,z,facing,divisions){
 return ((x*divisions+y)*divisions+z)*6+facing;
}

function selectStudioFinishSamples(points,normals,count){
 // Use the finest grid whose occupied cells fit the ray budget. Different
 // orientations within a cell get independent samples.
 for(const divisions of [24,18,14,11]){
  const samples=new Map();
  for(let v=0;v<count;v++){
   const i=v*3,nx=normals[i],ny=normals[i+1],nz=normals[i+2];
   if(nx===0&&ny===0&&nz===0)continue;
   const x=points[i]*divisions,y=points[i+1]*divisions,z=points[i+2]*divisions;
   const cx=Math.min(divisions-1,Math.floor(x)),cy=Math.min(divisions-1,Math.floor(y)),cz=Math.min(divisions-1,Math.floor(z));
   const key=studioFinishSampleKey(cx,cy,cz,studioFinishFacing(nx,ny,nz),divisions);
   const distance=(x-cx-.5)**2+(y-cy-.5)**2+(z-cz-.5)**2;
   const current=samples.get(key);
   if(!current||distance<current.distance)samples.set(key,{v,distance});
   if(samples.size>10000)break;
  }
  if(samples.size<=10000)return {samples,divisions};
 }
}

function sampleStudioFinishOcclusion(mesh,measures){
 const {points,faces,count}=mesh,{normals,bounds,order}=measures;
 const root=buildStudioFinishTree(bounds,order),values=new Float32Array(count);
 function measure(v){
  const i=v*3,nx=normals[i],ny=normals[i+1],nz=normals[i+2];
  const alongX=Math.abs(nx)>.8;
  const length=alongX?Math.hypot(nx,nz):Math.hypot(ny,nz);
  if(length<1e-8)return 0;
  const tx=alongX?-nz/length:0,ty=alongX?0:nz/length,tz=alongX?nx/length:-ny/length;
  const bx=ny*tz-nz*ty,by=nz*tx-nx*tz,bz=nx*ty-ny*tx;
  const origin=[points[i]+nx*2e-5,points[i+1]+ny*2e-5,points[i+2]+nz*2e-5];
  let sum=0;
  for(let sample=0;sample<STUDIO_FINISH_AO_SAMPLES;sample++){
   const u=(sample+.5)/STUDIO_FINISH_AO_SAMPLES;
   const angle=sample*2.399963229728653,radius=Math.sqrt(u),normal=Math.sqrt(1-u);
   const tangentX=radius*Math.cos(angle),tangentY=radius*Math.sin(angle);
   const direction=[nx*normal+tx*tangentX+bx*tangentY,ny*normal+ty*tangentX+by*tangentY,nz*normal+tz*tangentX+bz*tangentY];
   const distance=traceStudioFinishRay(root,points,faces,order,origin,direction);
   sum+=1-distance/STUDIO_FINISH_AO_RADIUS;
  }
  return sum/STUDIO_FINISH_AO_SAMPLES;
 }
 if(count<=10000){
  for(let v=0;v<count;v++)values[v]=measure(v);
  return values;
 }
 const {samples,divisions}=selectStudioFinishSamples(points,normals,count);
 for(const sample of samples.values())sample.ao=measure(sample.v);
 for(let v=0;v<count;v++){
  const i=v*3,nx=normals[i],ny=normals[i+1],nz=normals[i+2];
  if(nx===0&&ny===0&&nz===0)continue;
  const facing=studioFinishFacing(nx,ny,nz);
  const x=points[i]*divisions,y=points[i+1]*divisions,z=points[i+2]*divisions;
  const cx=Math.floor(x-.5),cy=Math.floor(y-.5),cz=Math.floor(z-.5);
  let sum=0,weights=0;
  for(let a=Math.max(0,cx);a<=Math.min(divisions-1,cx+1);a++){
   for(let b=Math.max(0,cy);b<=Math.min(divisions-1,cy+1);b++){
    for(let c=Math.max(0,cz);c<=Math.min(divisions-1,cz+1);c++){
     const sample=samples.get(studioFinishSampleKey(a,b,c,facing,divisions));
     if(!sample)continue;
     const j=sample.v*3;
     const dx=x-points[j]*divisions,dy=y-points[j+1]*divisions,dz=z-points[j+2]*divisions;
     const separation=dx*nx+dy*ny+dz*nz;
     const alignment=Math.max(0,nx*normals[j]+ny*normals[j+1]+nz*normals[j+2]);
     const blend=(1-Math.abs(x-a-.5))*(1-Math.abs(y-b-.5))*(1-Math.abs(z-c-.5));
     const weight=blend*alignment/(.15+dx*dx+dy*dy+dz*dz+4*separation*separation);
     sum+=sample.ao*weight;weights+=weight;
    }
   }
  }
  values[v]=weights>0?sum/weights:0;
 }
 return values;
}

function measureStudioFinishCurvature({points,faces,count},{faceNormals,areas,order}){
 const edges=new Map(),pairs=new Int32Array(faces.length),values=new Float32Array(count);
 for(const face of order){
  for(let corner=0;corner<3;corner++){
   const edge=face*3+corner,a=faces[edge],b=faces[face*3+(corner+1)%3];
   const key=Math.min(a,b)*count+Math.max(a,b);
   const prior=edges.get(key);
   if(prior===undefined){edges.set(key,edge+1);continue;}
   if(prior===0)continue;
   const previous=prior-1;
   if(pairs[previous]){
    pairs[pairs[previous]-1]=0;pairs[previous]=0;edges.set(key,0);
   }else if(faces[previous]===b){
    pairs[previous]=edge+1;pairs[edge]=prior;
   }else edges.set(key,0);
  }
 }
 for(let edge=0;edge<pairs.length;edge++){
  const opposite=pairs[edge]-1;
  if(opposite<=edge)continue;
  const i=edge-edge%3,j=opposite-opposite%3;
  const a=faces[edge],b=faces[i+(edge%3+1)%3];
  const ax=faceNormals[i],ay=faceNormals[i+1],az=faceNormals[i+2];
  const bx=faceNormals[j],by=faceNormals[j+1],bz=faceNormals[j+2];
  const dx=points[b*3]-points[a*3],dy=points[b*3+1]-points[a*3+1],dz=points[b*3+2]-points[a*3+2];
  const length=Math.hypot(dx,dy,dz);
  if(length<1e-8)continue;
  const sine=((ay*bz-az*by)*dx+(az*bx-ax*bz)*dy+(ax*by-ay*bx)*dz)/length;
  const cosine=ax*bx+ay*by+az*bz;
  const contribution=Math.atan2(sine,cosine)*length/4;
  values[a]+=contribution;values[b]+=contribution;
 }
 for(let i=0;i<count;i++)values[i]=areas[i]>0?values[i]*STUDIO_FINISH_CURVATURE_RADIUS/areas[i]:0;
 return values;
}

function smoothStudioFinishFields(mesh,measures,occlusion,curvature){
 const {faces,count,points}=mesh,{order,areas,totalArea}=measures;
 const aoSum=new Float32Array(count),curveSum=new Float32Array(count);
 const weights=new Float32Array(count),curveWeights=new Float32Array(count);
 const countDensity=Math.sqrt(totalArea/order.length);
 // Keep the smoothing footprint tied to model size while bounding dense-mesh work.
 const passes=Math.max(2,Math.min(14,Math.ceil((STUDIO_FINISH_CURVATURE_RADIUS/countDensity)**2)));
 const edgeWeights=new Float32Array(faces.length);
 for(const face of order){
  for(let corner=0;corner<3;corner++){
   const edge=face*3+corner,a=faces[edge]*3,b=faces[face*3+(corner+1)%3]*3;
   const length=Math.hypot(points[a]-points[b],points[a+1]-points[b+1],points[a+2]-points[b+2]);
   edgeWeights[edge]=Math.min(1,STUDIO_FINISH_CURVATURE_RADIUS/length);
   weights[a/3]+=edgeWeights[edge];weights[b/3]+=edgeWeights[edge];
   curveWeights[a/3]+=edgeWeights[edge]*areas[b/3];
   curveWeights[b/3]+=edgeWeights[edge]*areas[a/3];
  }
 }
 for(let pass=0;pass<passes;pass++){
  aoSum.fill(0);curveSum.fill(0);
  for(const face of order){
   for(let corner=0;corner<3;corner++){
    const edge=face*3+corner,a=faces[edge],b=faces[face*3+(corner+1)%3],weight=edgeWeights[edge];
    aoSum[a]+=occlusion[b]*weight;aoSum[b]+=occlusion[a]*weight;
    // Balance the density of dihedral contribution by the area it represents.
    curveSum[a]+=curvature[b]*weight*areas[b];curveSum[b]+=curvature[a]*weight*areas[a];
   }
  }
  for(let v=0;v<count;v++){
   const weight=weights[v];
   if(weight===0)continue;
   occlusion[v]+=(aoSum[v]/weight-occlusion[v])*.4;
   curvature[v]+=(curveSum[v]/curveWeights[v]-curvature[v])*.4;
  }
 }
}

function computeStudioMiniatureFinishes(positions,indices){
 if(positions.length%3||indices.length%3||indices.length/3>STUDIO_FINISH_MAX_TRIANGLES||positions.length>STUDIO_FINISH_MAX_TRIANGLES*9
  ||!positions.every(Number.isFinite)||!indices.every(index=>Number.isInteger(index)&&index>=0&&index<positions.length/3))
  throw Error('Unsupported miniature finish geometry.');
 const result=new Float32Array(positions.length/3*2);
 const mesh=prepareStudioFinishMesh(positions,indices);
 if(!mesh)return result;
 const measures=measureStudioFinishMesh(mesh);
 if(!measures.order.length)return result;
 const occlusion=sampleStudioFinishOcclusion(mesh,measures);
 const curvature=measureStudioFinishCurvature(mesh,measures);
 smoothStudioFinishFields(mesh,measures,occlusion,curvature);
 for(let v=0;v<mesh.welded.length;v++){
  const id=mesh.welded[v];
  result[v*2]=occlusion[id];
  result[v*2+1]=Math.tanh(curvature[id]);
 }
 return result;
}

if(typeof module!=='undefined')module.exports={computeStudioMiniatureFinishes};

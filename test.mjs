import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
import {findRooms,quantities,validateProject,nearest,toDXF} from './dist/geometry.mjs';
import {detectPlan} from './dist/detect.mjs';
const wall=(x1,y1,x2,y2,type='wall')=>({a:{x:x1,y:y1},b:{x:x2,y:y2},type});
const rectangle=[wall(.1,.1,.9,.1),wall(.9,.1,.9,.9),wall(.9,.9,.1,.9),wall(.1,.9,.1,.1)];
let rooms=findRooms(rectangle,10,10,.2);assert.equal(rooms.length,1);assert.ok(Math.abs(rooms[0].area-7.8**2)<1,rooms[0].area);
const divided=[...rectangle,wall(.5,.1,.5,.45),wall(.5,.45,.5,.55,'door'),wall(.5,.55,.5,.9)];assert.equal(findRooms(divided,10,10,.2).length,2);
const q=quantities([wall(0,0,.5,0),wall(.5,0,.6,0,'door')],10,10,3,.2);assert.ok(Math.abs(q.net-15.9)<1e-8);assert.ok(Math.abs(q.volume-3.18)<1e-8);assert.equal(q.doors,1);
assert.equal(nearest({x:1,y:0},wall(0,0,1,1),10,10).t,.5);assert.match(toDXF(rectangle,10,10),/\$INSUNITS\n70\n6/);
assert.doesNotThrow(()=>validateProject({version:1,walls:rectangle,width:10,ratio:1,height:3,thickness:.2,material:'#ffffff'}));assert.throws(()=>validateProject({version:2,walls:[wall(0,0,2,0)],width:10,ratio:1,height:3,thickness:.2,material:'#ffffff'}));
const width=600,height=450,data=new Uint8ClampedArray(width*height*4).fill(255);
function line(x1,y1,x2,y2,r=4){for(let y=Math.max(0,Math.floor(Math.min(y1,y2)-r));y<Math.min(height,Math.ceil(Math.max(y1,y2)+r));y++)for(let x=Math.max(0,Math.floor(Math.min(x1,x2)-r));x<Math.min(width,Math.ceil(Math.max(x1,x2)+r));x++){const n=nearest({x,y},{a:{x:x1,y:y1},b:{x:x2,y:y2}});if(n.d<=r){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=40}}}
line(60,50,540,50);line(540,50,540,400);line(540,400,60,400);line(60,400,60,50);line(300,50,300,200);line(300,245,300,400);
const detected=detectPlan(data,width,height,12);console.log('Detection fixture:',detected.stats,detected.walls.map(w=>[w.type,w.a,w.b]));assert.ok(detected.walls.length>=6&&detected.walls.length<25,'Unexpected wall count');assert.ok(detected.walls.some(w=>w.type==='door'),'Missing opening');for(const target of [wall(.1,50/450,.9,50/450),wall(.9,50/450,.9,400/450),wall(.1,400/450,.9,400/450)])assert.ok(detected.walls.some(w=>nearest({x:(target.a.x+target.b.x)/2,y:(target.a.y+target.b.y)/2},w,600,450).d<10),'Missing rectangle side');
assert.equal(detectPlan(new Uint8ClampedArray(width*height*4).fill(255),width,height,12).walls.length,0);
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});function crc(b){let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return(c^0xffffffff)>>>0}function chunk(type,buf){const t=Buffer.from(type),out=Buffer.alloc(buf.length+12);out.writeUInt32BE(buf.length);t.copy(out,4);buf.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,buf])),out.length-4);return out}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)Buffer.from(data.buffer,y*width*4,width*4).copy(scan,y*(width*4+1)+1);mkdirSync('fixtures',{recursive:true});writeFileSync('fixtures/plano-prueba.png',Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]));
console.log('Geometry, quantities, legacy import, DXF, blank image and reconstruction checks passed.');

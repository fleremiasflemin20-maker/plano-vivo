import {detectPlan} from './detect.mjs';
self.onmessage=e=>{try{const {pixels,width,height,worldWidth}=e.data;const result=detectPlan(pixels,width,height,worldWidth,(percent,message)=>self.postMessage({progress:percent,message}));self.postMessage({result})}catch(e){self.postMessage({error:e.message})}};

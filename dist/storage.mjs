let dbPromise;
function db(){return dbPromise||=new Promise((resolve,reject)=>{const req=indexedDB.open('plano-vivo-studio',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
export async function read(key){const database=await db();return new Promise((resolve,reject)=>{const r=database.transaction('projects').objectStore('projects').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
export async function write(key,value){const database=await db();return new Promise((resolve,reject)=>{const t=database.transaction('projects','readwrite');t.objectStore('projects').put(value,key);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}
export async function version(project){const versions=await read('versions')||[];versions.unshift({date:Date.now(),project});await write('versions',versions.slice(0,5))}

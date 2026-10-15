'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(process.env.RECEIVER_JS||path.join(__dirname,'../receiver.js'),'utf8').replace('  function status(', '  window.testHumanProof=requestHumanProof;\n  function status(');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function setup({scriptMissing=false}={}){
 let ready,options,rendered=0,seq=0;const timers=new Map(),calls=[];
 const box={};const element={querySelector:()=>box,append(){}};
 const sdk={ready:cb=>{ready=cb;},render:(_box,opts)=>{rendered++;options=opts;return 1;},remove(){}};
 const ctx=vm.createContext({window:{...(scriptMissing?{}:{turnstile:sdk})},document:{readyState:'complete',querySelector:()=>null,createElement:()=>({}),head:{append(){}}},WeakMap,URLSearchParams,AbortController,
 setTimeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
 fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({turnstileSiteKey:'0xSyntheticPublicSitekey'})};}});
 vm.runInContext(source,ctx);
 return {proof:()=>ctx.window.testHumanProof(element,'comment','00000000-0000-4000-8000-000000000001'),ready:()=>ready(),options:()=>options,rendered:()=>rendered,timers,calls};
}
test('widget is not rendered before the official SDK ready callback',async()=>{const s=setup(),p=s.proof();await flush();assert.equal(s.rendered(),0);s.ready();await flush();assert.equal(s.rendered(),1);s.options().callback('synthetic-token-only');assert.equal(await p,'synthetic-token-only');assert.equal(s.calls.length,1);});
test('only numeric provider error codes are exposed without tokens',async()=>{const s=setup(),p=s.proof();await flush();s.ready();await flush();s.options()['error-callback']('110200');await assert.rejects(p,e=>e.verificationCode==='challenge_110200'&&!e.message.includes('110200'));});
test('unexpected provider error text is never exposed',async()=>{const s=setup(),p=s.proof();await flush();s.ready();await flush();s.options()['error-callback']('SYNTHETIC_PRIVATE_PROVIDER_TEXT');await assert.rejects(p,e=>e.verificationCode==='challenge_failed'&&!e.message.includes('PRIVATE'));});
test('script loading failure has a bounded safe result and never posts an intake',async()=>{const s=setup({scriptMissing:true}),p=s.proof();await flush();const timeout=[...s.timers.values()].find(t=>t.ms===20000);assert.ok(timeout);timeout.fn();await assert.rejects(p,e=>e.verificationCode==='script_unavailable');assert.deepEqual(s.calls,['/receiver-security.json']);});

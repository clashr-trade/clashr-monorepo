// Uses an existing isolated Chrome test profile with remote debugging enabled.
// Creates and closes its own tab; it does not connect wallets or submit transactions.
import assert from 'node:assert/strict';

const browser=process.env.BROWSER_DEBUG_URL||'http://127.0.0.1:9223';
const base=process.env.BASE_URL||'http://localhost:3000';
const target=await fetch(`${browser}/json/new?about:blank`,{method:'PUT'}).then(response=>response.json());
const socket=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve=>socket.onopen=resolve);
let sequence=0;
const pending=new Map(),errors=[];
socket.onmessage=event=>{
  const message=JSON.parse(event.data);
  if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}
  if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
  if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(arg=>arg.value||arg.description).join(' '));
};
const call=(method,params={})=>new Promise(resolve=>{pending.set(++sequence,resolve);socket.send(JSON.stringify({id:sequence,method,params}));});
const evaluate=async expression=>{
  const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.result.exceptionDetails)throw new Error(result.result.exceptionDetails.exception?.description||result.result.exceptionDetails.text);
  return result.result.result.value;
};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function navigate(path){
  await call('Page.navigate',{url:new URL(path,base).href});
  for(let attempt=0;attempt<200;attempt++){
    await pause(100);
    if(await evaluate(`location.pathname===${JSON.stringify(path)}&&document.readyState==='complete'&&!!document.querySelector('.clashr-language-trigger')`)){await pause(250);return;}
  }
  throw new Error(`Page did not finish loading: ${path}`);
}
async function choose(index){
  await evaluate(`document.querySelector('.clashr-language-trigger').click()`);
  await pause(50);
  await evaluate(`document.querySelectorAll('[role="option"]')[${index}].click()`);
  await pause(100);
}
try{
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
  await call('Network.setCacheDisabled',{cacheDisabled:true});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/');
  const order=await evaluate(`[...document.querySelector('.clashr-header-actions').children].slice(0,4).map(element=>element.getAttribute('aria-label')||element.className)`);
  assert.equal(order[0],'X');assert.equal(order[1],'Telegram');assert.equal(order[2],'clashr-language');assert.match(order[3],/clashr-nav-entry/);
  await evaluate(`document.querySelector('.clashr-language-trigger').focus()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowDown',code:'ArrowDown',windowsVirtualKeyCode:40});
  await pause(80);assert(await evaluate(`!!document.querySelector('[role="listbox"]')`));
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await pause(80);assert(await evaluate(`!document.querySelector('[role="listbox"]')&&document.activeElement.classList.contains('clashr-language-trigger')`));
  const routes=['/trenches','/feed','/agents','/leaderboard','/contest','/people','/me','/settings','/transparency','/whitepaper','/agent-docs','/terms','/privacy','/risk'];
  let checks=0;
  for(const[index,language]of [[0,'zh-CN'],[1,'en'],[2,'ja']]){
    await navigate('/');await choose(index);
    for(const route of routes){
      await navigate(route);
      const result=await evaluate(`({language:document.documentElement.lang,selected:document.querySelector('.clashr-language-trigger span')?.textContent,overflow:document.documentElement.scrollWidth>innerWidth})`);
      assert.equal(result.language,language,route);assert.equal(result.overflow,false,route);checks++;
    }
    console.log(`${language}: ${routes.length} routes retained preference without overflow`);
  }
  await navigate('/');await choose(0);
  for(const width of[1440,390,320]){
    await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    await pause(100);
    assert(await evaluate(`document.querySelector('.clashr-header-actions').getBoundingClientRect().right<=innerWidth`),`Landing header at ${width}`);
    await evaluate(`document.querySelector('.clashr-language-trigger').click()`);await pause(50);
    assert(await evaluate(`document.querySelector('[role="listbox"]').getBoundingClientRect().right<=innerWidth`));
    await evaluate(`document.querySelector('main').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);await pause(50);
    assert(await evaluate(`!document.querySelector('[role="listbox"]')`));
  }
  await navigate('/feed');
  assert(await evaluate(`document.querySelector('.clashr-language-trigger').getBoundingClientRect().right<=innerWidth`),'Mobile terminal language control');
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Mobile terminal overflow');
  assert.deepEqual(errors,[],'Browser exceptions or hydration errors');
  console.log(`Passed ${checks} route/language checks, keyboard menu, click-outside dismissal and mobile headers.`);
}finally{
  socket.close();await fetch(`${browser}/json/close/${target.id}`);
}

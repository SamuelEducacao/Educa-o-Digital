import {CONFIG} from './config.mjs';
import {TYPES,httpsOrigin,envelope,validMessage,trustedEvent} from './protocol.mjs';
import {createCaptureController} from './capture-controller.mjs';
// Display-only diagnostic. It never grants trust, changes an origin or echoes a URL.
export function normalizeDiagnosticOrigin(value){
  if(value==='null')return{value:'Origem opaca (null)',selectable:false};
  if(typeof value!=='string'||value.length>512)return{value:'Origem inválida',selectable:false};
  try{
    const u=new URL(value);
    if(u.protocol!=='https:')return{value:'Origem não HTTPS',selectable:false};
    if(u.username||u.password||u.origin!==value||u.search||u.hash||u.pathname!=='/')return{value:'Origem inválida',selectable:false};
    return{value:u.origin,selectable:true};
  }catch{return{value:'Origem inválida',selectable:false};}
}
const CONNECTED='ponto-camera-connected'; // Optional V1 acknowledgement; old bridges safely ignore it.
export function mountCameraPage({win,doc,config=CONFIG,now=()=>Date.now()}) {
  const $=id=>doc.getElementById(id);const expectedOpener=win.opener;
  const allowed=config.allowedAppOrigins.map(httpsOrigin);
  const deadline=now()+Math.min(180000,config.sessionTimeoutMs||180000);
  let origin=null,nonce=null,closed=false,sending=false,expiry=null,ackTimeout=null,readyTimer=null,warningTimer=null,diagnostic='WAITING';
  const status=text=>{$('status').textContent=text;};
  const locked=()=>{for(const id of ['open','take','retake','discard','confirm'])$(id).disabled=true;};
  let controller;
  function clearOriginDiagnostic(){$('receivedOrigin').value='';$('originDiagnostic').hidden=true;$('selectOrigin').disabled=true;}
  function showOriginDiagnostic(value){if(closed||nonce)return;const safe=normalizeDiagnosticOrigin(value);$('receivedOrigin').value=safe.value;$('originDiagnostic').hidden=false;$('selectOrigin').disabled=!safe.selectable;}
  function selectOrigin(){if(closed||$('originDiagnostic').hidden||$('selectOrigin').disabled)return;$('receivedOrigin').focus();$('receivedOrigin').select();}
  function end(text){if(closed)return;closed=true;for(const timer of [expiry,ackTimeout,readyTimer,warningTimer])win.clearTimeout(timer);controller?.close();nonce=null;origin=null;clearOriginDiagnostic();win.removeEventListener('message',receive);doc.removeEventListener('visibilitychange',onVisibility);win.removeEventListener('pagehide',onPageHide);$('reconnect').removeEventListener('click',reconnect);$('selectOrigin').removeEventListener('click',selectOrigin);locked();$('reconnect').hidden=true;status(text);}
  function alive(){
    if(closed)return false;
    if(now()>=deadline){end(nonce?'Sessão expirada. Volte ao ponto e abra a câmera novamente. [SESSION_DEADLINE]':'A conexão expirou. Volte ao ponto e abra a câmera novamente. [CONNECTION_DEADLINE]');return false;}
    try{if(!expectedOpener||!win.opener||win.opener!==expectedOpener||expectedOpener.closed){end('A ligação com o formulário foi perdida. Volte ao ponto e abra a câmera novamente. [OPENER_LOST]');return false;}}catch{end('Não foi possível acessar a ligação com o formulário. [OPENER_LOST]');return false;}
    return true;
  }
  function issue(code,text){if(closed||nonce)return;diagnostic=code;$('reconnect').hidden=false;status(text+' ['+code+']');}
  function send(message,target){if(!alive())return false;try{expectedOpener.postMessage(message,target);return true;}catch{end('A ligação com o formulário foi perdida. [OPENER_LOST]');return false;}}
  function render(s){
    $('video').hidden=s.phase!=='live';$('preview').hidden=!s.photo;
    if(s.photo)$('preview').src=s.photo.jpeg;else $('preview').removeAttribute('src');
    $('open').hidden=s.phase==='live'||s.phase==='preview';$('take').hidden=s.phase!=='live';
    for(const id of ['retake','discard','confirm'])$(id).hidden=s.phase!=='preview';
    for(const id of ['open','take','retake','discard','confirm'])$(id).disabled=!nonce||closed||sending||s.phase==='opening';
    if(s.message)status(s.message);
  }
  function receive(event){
    if(!alive())return;
    if(event.source!==expectedOpener){if(allowed.includes(event.origin)&&validMessage(event.data,TYPES.init))issue('SOURCE_REJECTED','A resposta veio de outra janela. Volte ao ponto e abra a câmera novamente.');return;}
    if(!allowed.includes(event.origin)){if(validMessage(event.data,TYPES.init)&&!nonce){showOriginDiagnostic(event.origin);issue('ORIGIN_REJECTED','A origem do formulário não está autorizada nesta página. Selecione a origem abaixo para informar o diagnóstico. Nenhuma câmera foi acionada.');}return;}
    if(event.data?.type===TYPES.init){
      if(!validMessage(event.data,TYPES.init)){issue('INIT_INVALID','A resposta de conexão está incompleta. Tente reconectar.');return;}
      if(nonce&&event.data.nonce!==nonce){status('A resposta pertence a outra sessão. Volte ao ponto e abra a câmera novamente. [NONCE_REJECTED]');return;}
      if(!nonce){clearOriginDiagnostic();origin=event.origin;nonce=event.data.nonce;win.clearTimeout(readyTimer);win.clearTimeout(warningTimer);$('reconnect').hidden=true;diagnostic='CONNECTED';render({phase:'idle',photo:null,message:'Conectado. Toque em Abrir câmera. Faça uma foto ampla e nítida do local, sem pessoas ou documentos.'});}
      send(envelope(CONNECTED,nonce),origin);return;
    }
    if(nonce&&sending&&trustedEvent(event,origin,expectedOpener)&&validMessage(event.data,TYPES.ack)&&event.data.nonce===nonce){end('Foto devolvida ao formulário. Confira lá se o armazenamento está habilitado. Nenhum ponto foi registrado por esta página.');try{win.close();}catch{}}
  }
  controller=createCaptureController({mediaDevices:win.navigator.mediaDevices,video:$('video'),canvasFactory:()=>doc.createElement('canvas'),onState:render});
  $('open').addEventListener('click',()=>{if(alive()&&nonce&&!sending)controller.start();});
  $('take').addEventListener('click',()=>{if(alive())controller.take();});
  $('retake').addEventListener('click',()=>{if(alive()&&nonce&&!sending)controller.start();});
  $('discard').addEventListener('click',()=>{if(alive())controller.discard();});
  $('confirm').addEventListener('click',()=>{
    const photo=controller.getPhoto();if(!photo||!alive()||!nonce||sending)return;
    sending=true;locked();status('Devolvendo a foto ao formulário para conferência…');
    if(send({...envelope(TYPES.photo,nonce),...photo},origin))ackTimeout=win.setTimeout(()=>end('A devolução não foi confirmada. Volte ao ponto e confira antes de tentar novamente. [PHOTO_ACK_TIMEOUT]'),8000);
  });
  $('cancel').addEventListener('click',()=>{if(nonce&&origin&&!closed)send(envelope(TYPES.cancel,nonce),origin);end('Captura cancelada. Volte ao formulário.');try{win.close();}catch{}});
  const onVisibility=()=>{if(doc.hidden)controller.hide();};doc.addEventListener('visibilitychange',onVisibility);
  const onPageHide=()=>end('Captura encerrada.');win.addEventListener('pagehide',onPageHide);
  function ready(){if(!alive()||nonce)return;win.clearTimeout(readyTimer);for(const target of allowed)if(!send(envelope(TYPES.ready),target))return;readyTimer=win.setTimeout(ready,1000);}
  function reconnect(){if(!alive()||nonce)return;clearOriginDiagnostic();status('Tentando conectar. Se a aba do ponto estiver pausada, volte a ela e depois retorne aqui. Nenhuma câmera foi acionada. [RECONNECTING]');ready();}
  $('reconnect').addEventListener('click',reconnect);$('selectOrigin').addEventListener('click',selectOrigin);clearOriginDiagnostic();locked();
  if(config.enabled!==true||allowed.length===0)end('A captura não está habilitada. [CONFIG_DISABLED]');
  else if(win.top!==win.self||!win.isSecureContext||win.location.protocol!=='https:')end('Abra esta página pelo formulário de ponto em uma nova aba segura. [INVALID_CONTEXT]');
  else if(!expectedOpener)end('A página não está ligada ao formulário. Abra a câmera pelo botão do ponto. [OPENER_MISSING]');
  else{
    win.addEventListener('message',receive);status('Conectando ao formulário de ponto…');ready();
    warningTimer=win.setTimeout(()=>{if(!alive()||nonce||diagnostic!=='WAITING')return;issue('WAITING_FOR_INIT','A conexão está demorando. Tente reconectar; se a aba do ponto estiver pausada, volte a ela e depois retorne aqui. Nenhuma câmera foi acionada.');},10000);
    expiry=win.setTimeout(()=>alive(),Math.max(0,deadline-now()));
  }
  return {dispose(){end('Captura encerrada.');}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')mountCameraPage({win:window,doc:document});

import {CONFIG} from './config.mjs';
import {TYPES,httpsOrigin,envelope,validMessage,trustedEvent} from './protocol.mjs';
import {createCaptureController} from './capture-controller.mjs';
export function mountCameraPage({win,doc,config=CONFIG}) {
  const $=id=>doc.getElementById(id);let origin=null,nonce=null,closed=false,sending=false,expiry=null,ackTimeout=null,readyTimer=null;
  const allowed=config.allowedAppOrigins.map(httpsOrigin);
  const status=text=>{$('status').textContent=text;};
  const locked=()=>{for(const id of ['open','take','retake','discard','confirm'])$(id).disabled=true;};
  let controller;
  function end(text){if(closed)return;closed=true;win.clearTimeout(expiry);win.clearTimeout(ackTimeout);win.clearTimeout(readyTimer);controller?.close();win.removeEventListener('message',receive);doc.removeEventListener('visibilitychange',onVisibility);win.removeEventListener('pagehide',onPageHide);locked();status(text);}
  function render(s){
    $('video').hidden=s.phase!=='live';$('preview').hidden=!s.photo;
    if(s.photo)$('preview').src=s.photo.jpeg;else $('preview').removeAttribute('src');
    $('open').hidden=s.phase==='live'||s.phase==='preview';$('take').hidden=s.phase!=='live';
    for(const id of ['retake','discard','confirm'])$(id).hidden=s.phase!=='preview';
    for(const id of ['open','take','retake','discard','confirm'])$(id).disabled=!nonce||closed||sending||s.phase==='opening';
    if(s.message)status(s.message);
  }
  function receive(event){
    if(closed||event.source!==win.opener||!allowed.includes(event.origin))return;
    if(!nonce&&validMessage(event.data,TYPES.init)){
      win.clearTimeout(expiry);win.clearTimeout(readyTimer);origin=event.origin;nonce=event.data.nonce;expiry=win.setTimeout(()=>end('Sessão expirada. Volte ao ponto e abra a câmera novamente.'),config.sessionTimeoutMs);
      render({phase:'idle',photo:null,message:'Toque em Abrir câmera. Fotografe o local, sem pessoas ou documentos.'});return;
    }
    if(nonce&&sending&&trustedEvent(event,origin,win.opener)&&validMessage(event.data,TYPES.ack)&&event.data.nonce===nonce){
      end('Prévia de teste devolvida ao formulário. A foto não foi salva e nenhum ponto foi registrado.');try{win.close();}catch{}
    }
  }
  controller=createCaptureController({mediaDevices:win.navigator.mediaDevices,video:$('video'),canvasFactory:()=>doc.createElement('canvas'),onState:render});
  $('open').addEventListener('click',()=>{if(nonce&&!closed&&!sending)controller.start();});
  $('take').addEventListener('click',()=>controller.take());
  $('retake').addEventListener('click',()=>controller.start());
  $('discard').addEventListener('click',()=>controller.discard());
  $('confirm').addEventListener('click',()=>{
    const photo=controller.getPhoto();if(!photo||!nonce||closed||sending)return;
    sending=true;locked();status('Devolvendo a prévia de teste. A foto não será salva…');
    win.opener.postMessage({...envelope(TYPES.photo,nonce),...photo},origin);
    ackTimeout=win.setTimeout(()=>end('A devolução não foi confirmada. Volte ao ponto e confira antes de tentar novamente.'),8000);
  });
  $('cancel').addEventListener('click',()=>{if(nonce&&origin&&!closed)win.opener.postMessage(envelope(TYPES.cancel,nonce),origin);end('Captura cancelada. Volte ao formulário.');try{win.close();}catch{}});
  const onVisibility=()=>{if(doc.hidden)controller.hide();};doc.addEventListener('visibilitychange',onVisibility);
  const onPageHide=()=>end('Captura encerrada.');win.addEventListener('pagehide',onPageHide);
  locked();
  if(config.enabled!==true||allowed.length===0){end('Protótipo não publicado: hospedagem e origens aguardam aprovação.');}
  else if(win.top!==win.self||!win.isSecureContext||win.location.protocol!=='https:'||!win.opener){end('Abra esta página pelo botão do formulário de ponto, em uma nova aba segura.');}
  else{
    win.addEventListener('message',receive);status('Conectando ao formulário de ponto…');
    // Origin is not learned from the URL. Each destination is an explicitly approved exact origin.
    function ready(){if(closed||nonce)return;for(const target of allowed)win.opener.postMessage(envelope(TYPES.ready),target);readyTimer=win.setTimeout(ready,1000);}
    ready();
    expiry=win.setTimeout(()=>end('Não foi possível conectar. Volte ao ponto e tente novamente.'),10000);
  }
  return {dispose(){end('Captura encerrada.');doc.removeEventListener('visibilitychange',onVisibility);win.removeEventListener('pagehide',onPageHide);}};
}
if(typeof window!=='undefined'&&typeof document!=='undefined')mountCameraPage({win:window,doc:document});

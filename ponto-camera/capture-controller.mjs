import {MAX_DATA_URL,MAX_SIDE,MAX_PIXELS} from './protocol.mjs';
export function createCaptureController({mediaDevices,video,canvasFactory,onState=()=>{}}) {
  let generation=0,stream=null,photo=null,phase='idle',closed=false;
  const emit=(message='')=>onState({phase,photo,stream,message});
  function stop(){generation++;if(stream){for(const track of stream.getTracks())track.stop();stream=null;}video.srcObject=null;}
  function clear(){photo=null;}
  async function start(){
    if(closed || phase==='opening' || phase==='live')return;
    stop();clear();phase='opening';emit('Autorize a câmera para fotografar o local.');const ticket=generation;
    try{
      if(!mediaDevices?.getUserMedia)throw {name:'NotSupportedError'};
      const next=await mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}}});
      if(closed||ticket!==generation){for(const t of next.getTracks())t.stop();return;}
      stream=next;video.srcObject=next;await video.play();
      if(closed||ticket!==generation)return;
      phase='live';emit('Enquadre o local e toque em Tirar foto.');
    }catch(error){
      if(closed||ticket!==generation)return;
      stop();phase='idle';emit(error?.name==='NotAllowedError'?'A câmera não foi autorizada. Você pode tentar novamente ou cancelar.':error?.name==='NotFoundError'?'Nenhuma câmera foi encontrada.':'Não foi possível abrir a câmera. Tente novamente ou cancele.');
    }
  }
  function take(){
    if(closed||phase!=='live')return;
    try{
      const width=video.videoWidth,height=video.videoHeight;
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error();
      const scale=Math.min(1,MAX_SIDE/width,MAX_SIDE/height,Math.sqrt(MAX_PIXELS/(width*height)));
      const canvas=canvasFactory();canvas.width=Math.max(1,Math.floor(width*scale));canvas.height=Math.max(1,Math.floor(height*scale));
      const ctx=canvas.getContext('2d');if(!ctx)throw Error();ctx.drawImage(video,0,0,canvas.width,canvas.height);
      let jpeg=canvas.toDataURL('image/jpeg',.72);if(jpeg.length>MAX_DATA_URL)jpeg=canvas.toDataURL('image/jpeg',.45);
      if(jpeg.length>MAX_DATA_URL||!jpeg.startsWith('data:image/jpeg;base64,'))throw Error();
      photo={jpeg,width:canvas.width,height:canvas.height};stop();phase='preview';emit('Confira a foto. Você pode refazer ou descartar.');
      canvas.width=0;canvas.height=0;
    }catch{stop();clear();phase='idle';emit('Não foi possível capturar a foto. Tente novamente.');}
  }
  function discard(){if(closed)return;stop();clear();phase='idle';emit('Foto descartada.');}
  function hide(){if(closed)return;if(phase==='opening'||phase==='live'){stop();phase='idle';emit('Câmera interrompida. Toque em Abrir câmera para continuar.');}}
  function close(){stop();clear();closed=true;phase='closed';emit();}
  function getPhoto(){return photo?{...photo}:null;}
  return {start,take,discard,hide,close,getPhoto,get phase(){return phase;}};
}

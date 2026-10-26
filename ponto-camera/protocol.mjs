// No network, persistence, credentials or personal identifiers are used here.
export const VERSION = 1;
export const MAX_DATA_URL = 700000;
export const MAX_SIDE = 1280;
export const MAX_PIXELS = 1280 * 960;
export const TYPES = Object.freeze({ready:'ponto-camera-ready',init:'ponto-camera-init',photo:'ponto-camera-photo',cancel:'ponto-camera-cancel',ack:'ponto-camera-ack'});
const keysEqual = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export function httpsOrigin(value) {
  if (typeof value !== 'string' || value.includes('*')) throw new Error('Origem HTTPS exata obrigatória.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== value) throw new Error('Origem HTTPS exata obrigatória.');
  return value;
}
export function captureURL(value) {
  const url = new URL(value);
  httpsOrigin(url.origin);
  if (url.username || url.password || url.search || url.hash) throw new Error('A URL de captura não pode levar parâmetros ou fragmentos.');
  return url.href;
}
export const validNonce = n => typeof n === 'string' && /^[a-f0-9]{64}$/.test(n);
export function newNonce(crypto) {
  const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
  return [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
}
export function envelope(type, nonce) {
  if (type === TYPES.ready) return {v:VERSION,type};
  if (!validNonce(nonce)) throw new Error('Sessão inválida.');
  return {v:VERSION,type,nonce};
}
export function validMessage(value, type) {
  const keys = type === TYPES.ready ? ['v','type'] : type === TYPES.photo ? ['v','type','nonce','jpeg','width','height'] : ['v','type','nonce'];
  return keysEqual(value,keys) && value.v===VERSION && value.type===type && (type===TYPES.ready || validNonce(value.nonce));
}
export function validPhoto(photo) {
  if (!validMessage(photo,TYPES.photo) || typeof photo.jpeg!=='string' || photo.jpeg.length>MAX_DATA_URL || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.jpeg)) return false;
  if (![photo.width,photo.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=MAX_SIDE) || photo.width*photo.height>MAX_PIXELS) return false;
  const payload=photo.jpeg.slice('data:image/jpeg;base64,'.length);
  if(payload.length%4!==0)return false;
  try {const bytes=atob(payload);return bytes.length>=4&&bytes.charCodeAt(0)===255&&bytes.charCodeAt(1)===216&&bytes.charCodeAt(2)===255&&bytes.charCodeAt(bytes.length-2)===255&&bytes.charCodeAt(bytes.length-1)===217;}catch{return false;}
}
export function trustedEvent(event, origin, source) { return event.origin===origin && event.source===source; }

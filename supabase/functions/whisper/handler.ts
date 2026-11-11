type Payload = Record<string, unknown>;
export type Result = { status: number; body: unknown };
export type RPC = (action: string, payload: Payload) => Promise<Result>;
const errors = {
  bad: 'Dữ liệu không hợp lệ.',
  gone: 'Lời nhắn không còn khả dụng hoặc link không đúng.',
  unavailable: 'Tạm thời không thể kết nối. Vui lòng thử lại.',
};
const maxBody = 2_850_000;
const token = (v: unknown): v is string => typeof v === 'string' && v.length === 43 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v);
const pin = (v: unknown) => v == null || typeof v === 'string' && v.length === 6 && /^\d{6}$/.test(v);
function bytes(v: unknown, min: number, max: number) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]+$/.test(v) || v.length > Math.ceil(max * 4 / 3)) return false;
  try {
    const raw = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
    return raw.length >= min && raw.length <= max && btoa(raw).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') === v;
  } catch { return false; }
}
function fields(v: Payload, required: string[], optional: string[] = []) {
  return required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
}
async function sha(s: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
function hex(b: ArrayBuffer) { return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, '0')).join(''); }
function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function body(req: Request): Promise<Payload> {
  if (!req.headers.get('content-type')?.split(';')[0].trim().match(/^application\/json$/i)) throw new Error('bad');
  if (Number(req.headers.get('content-length')) > maxBody) throw new Error('large');
  const reader = req.body?.getReader(); if (!reader) throw new Error('bad');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > maxBody) throw new Error('large'); chunks.push(next.value); }
  } finally { await reader.cancel().catch(() => {}); }
  const data = new Uint8Array(size); let at = 0; for (const chunk of chunks) { data.set(chunk, at); at += chunk.length; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(data)); } catch { throw new Error('bad'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('bad');
  return parsed;
}
export function handler(config: { origin: string; pepper: string; rpc: RPC }) {
  if (!/^https?:\/\/[^/]+$/.test(config.origin) || config.pepper.length < 32) throw new Error('Missing server configuration');
  const macKey = crypto.subtle.importKey('raw', new TextEncoder().encode(config.pepper), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const mac = async (id: string, code: string) => hex(await crypto.subtle.sign('HMAC', await macKey, new TextEncoder().encode(`${id}:${code}`)));
  return async (req: Request): Promise<Response> => {
    const headers: Record<string,string> = {'Cache-Control':'no-store, max-age=0','Pragma':'no-cache','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
    const reply = (status: number, data: unknown) => new Response(status === 204 ? null : JSON.stringify(data), {status,headers});
    const path = new URL(req.url).pathname.replace(/^\/functions\/v1\/whisper(?=\/|$)/, '').replace(/^\/whisper(?=\/|$)/, '').replace(/^\/api(?=\/|$)/, '');
    if (req.method === 'GET' && path === '/health') return reply(200, {ok:true});
    if ((req.method === 'GET' || req.method === 'HEAD') && /^\/preview\/[A-Za-z0-9_-]{16}$/.test(path)) {
      const handle = path.slice('/preview/'.length);
      try {
        const result = await config.rpc('preview',{preview:handle});
        if (result.status !== 200 && result.status !== 410) return reply(503,{error:errors.unavailable});
        return reply(result.status,result.status === 200 ? result.body : {});
      } catch { return reply(503,{error:errors.unavailable}); }
    }
    if (req.headers.get('origin') !== config.origin) return reply(403, {error:'Nguồn yêu cầu không được phép.'});
    headers['Access-Control-Allow-Origin'] = config.origin;
    if (req.method === 'OPTIONS') {
      headers['Access-Control-Allow-Methods'] = 'POST'; headers['Access-Control-Allow-Headers'] = 'content-type';
      return reply(204, null);
    }
    if (req.method !== 'POST') return reply(405, {error:errors.bad});
    const match = path.match(/^\/messages\/([^/]+)\/(metadata|open|revoke)$/);
    const action = path === '/challenges' ? 'challenge' : path === '/messages' ? 'create' : match?.[2];
    if (!action) return reply(404, {error:errors.gone});
    try {
      const v = await body(req); let payload: Payload;
      if (action === 'challenge') {
        if (!fields(v,['mobile']) || typeof v.mobile !== 'boolean') return reply(400,{error:errors.bad});
        let n: number; do { n = crypto.getRandomValues(new Uint8Array(1))[0]; } while (n >= 200);
        const id = randomToken(), target = v.mobile ? 100 : n % 100 + 1;
        const result = await config.rpc(action,{id_hash:await sha(id),target});
        return reply(result.status,result.status === 200 ? {id,target,expires_in:120} : result.body);
      }
      if (action === 'create') {
        if (!fields(v,['ciphertext','iv','access','revoke','ttl','burn'],['id','pin','verification']) ||
          v.id != null && !token(v.id) || !token(v.access) || !token(v.revoke) || v.access === v.revoke || !pin(v.pin) ||
          !Number.isInteger(v.ttl) || (v.ttl as number) < 60 || (v.ttl as number) > 604800 || typeof v.burn !== 'boolean' ||
          !bytes(v.ciphertext,17,2097168) || !bytes(v.iv,12,12)) return reply(400,{error:errors.bad});
        const verification = v.verification as Payload | null;
        if (!verification || typeof verification !== 'object' || !fields(verification,['id','answer']) || !token(verification.id) ||
          !Number.isInteger(verification.answer) || (verification.answer as number) < 0 || (verification.answer as number) > 100)
          return reply(400,{error:'Hãy kéo thanh xác nhận trước khi tạo link.'});
        const id = (v.id as string | null) ?? randomToken();
        payload = {id,ciphertext:v.ciphertext,iv:v.iv,ttl:v.ttl,burn:v.burn,access_hash:await sha(v.access),revoke_hash:await sha(v.revoke),
          pin_hash:v.pin ? await mac(id,v.pin as string) : '',challenge_hash:await sha(verification.id),answer:verification.answer};
      } else {
        const id = match![1];
        if (!token(id)) return reply(410,{error:errors.gone});
        if (action === 'revoke') {
          if (!fields(v,['revoke']) || !token(v.revoke)) return reply(410,{error:errors.gone});
          payload = {id,revoke_hash:await sha(v.revoke)};
        } else {
          if (!fields(v,['access'],['pin']) || !token(v.access) || v.pin != null && typeof v.pin !== 'string' || typeof v.pin === 'string' && v.pin.length > 64) return reply(410,{error:errors.gone});
          payload = {id,access_hash:await sha(v.access),pin_hash:await mac(id,(v.pin as string) || ''),has_pin:!!v.pin};
        }
      }
      const result = await config.rpc(action,payload);
      return reply(result.status,result.body);
    } catch (e) {
      if (e instanceof Error && e.message === 'bad') return reply(400,{error:errors.bad});
      if (e instanceof Error && e.message === 'large') return reply(413,{error:errors.bad});
      // Never log bodies, capabilities, database errors or provider credentials.
      return reply(503,{error:errors.unavailable});
    }
  };
}


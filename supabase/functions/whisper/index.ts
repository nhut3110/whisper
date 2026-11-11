import { handler } from './handler.ts';
const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
Deno.serve(handler({
  origin: Deno.env.get('APP_ORIGIN')!,
  pepper: Deno.env.get('PIN_PEPPER')!,
  async rpc(action, payload) {
    const res = await fetch(`${url}/rest/v1/rpc/hush_api`, {
      method:'POST', headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${key}`},
      body:JSON.stringify({action,payload}), signal:AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('Database unavailable');
    return await res.json();
  },
}));

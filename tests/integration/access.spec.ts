import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import { createApp } from '../../src/http/app.js';
import { readConfig } from '../../src/config.js';
import { migrate } from '../../src/db/migrate.js';
import { installUser } from '../../src/access/installation.js';
const url = process.env.JANELA_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/janela_test' || new URL(url).username !== 'janela_test' || new URL(url).hostname !== '127.0.0.1') throw new Error('Isolated janela_test database required');
const schema = `jt_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
const servers: Server[] = [];
const addresses: string[] = [];
const config = readConfig({ NODE_ENV: 'test', DATABASE_URL: url, SESSION_SECRET: 'fixture-secret-only-at-least-32-characters', APP_URL: 'http://janela.test', JANELA_DEMO_ENABLED: 'true' });
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  for (let index=0; index<3; index++) {
    const server = createApp({ pool, config:{...config,loginEnabled:index===2} }).listen(0,'127.0.0.1');
    servers.push(server);
    await once(server,'listening');
    const bound = server.address();
    if (!bound || typeof bound==='string') throw new Error('HTTP bind failed');
    addresses.push(`http://127.0.0.1:${bound.port}`);
  }
});
test('normal mode requires explicit installation, validates login and rotates the session',async()=>{
  const visitor=new Visitor();
  await visitor.initialize();
  expect((await visitor.request('/api/login',{host:2,method:'POST',body:{email:'operator@example.test',password:'fixture-operator-password'}})).status).toBe(401);
  await installUser(pool,{email:'operator@example.test',name:'Operador fictício',password:'fixture-operator-password'});
  expect((await visitor.request('/api/login',{host:2,method:'POST',body:{email:'operator@example.test',password:'wrong-password'}})).status).toBe(401);
  const oldSession=visitor.cookies.get('janela_session');
  const login=await visitor.request('/api/login',{host:2,method:'POST',body:{email:'operator@example.test',password:'fixture-operator-password'}});
  expect(login.status).toBe(200);
  const authenticated=await login.json();
  expect(authenticated.workspace.kind).toBe('normal');
  expect(visitor.cookies.get('janela_session')).not.toBe(oldSession);
  visitor.workspace=authenticated.workspace.id;
  await visitor.initialize();
  expect((await visitor.request('/api/resources',{host:2})).status).toBe(200);
  expect((await visitor.request('/api/demo/reset',{host:2,method:'POST',body:{}})).status).toBe(404);
  expect((await visitor.request('/api/logout',{host:2,method:'POST',body:{}})).status).toBe(200);
  expect((await visitor.request('/api/resources',{host:2})).status).toBe(404);
});
afterAll(async () => {
  for (const server of servers) await new Promise<void>(resolve=>server.close(()=>resolve()));
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe schema cleanup');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});
class Visitor {
  cookies = new Map<string,string>();
  csrf='';
  workspace='';
  async request(path:string, options: { host?:number; method?:string; body?:unknown; origin?:string; csrf?:string; workspace?:string }={}) {
    const headers: Record<string,string> = { Cookie: [...this.cookies].map(([name,value])=>`${name}=${value}`).join(';') };
    if (options.method && options.method!=='GET') {
      headers.Origin=options.origin??config.appUrl;
      headers['X-CSRF-Token']=options.csrf??this.csrf;
      headers['Content-Type']='application/json';
    }
    if (options.workspace??this.workspace) headers['X-Janela-Workspace']=options.workspace??this.workspace;
    const response = await fetch(`${addresses[options.host??0]}${path}`, { method:options.method??'GET', headers, ...(options.body===undefined?{}:{body:JSON.stringify(options.body)}) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair=cookie.split(';')[0]!;
      const separator=pair.indexOf('=');
      this.cookies.set(pair.slice(0,separator),pair.slice(separator+1));
    }
    return response;
  }
  async initialize() {
    const response=await this.request('/api/csrf');
    expect(response.status).toBe(200);
    this.csrf=(await response.json()).token;
  }
  async start() {
    await this.initialize();
    const response=await this.request('/api/demo/start',{method:'POST',body:{}});
    expect(response.status).toBe(200);
    const data=await response.json();
    this.workspace=data.workspace.id;
    await this.initialize();
    return data;
  }
}
test('signed sessions cross HTTP instances, isolate visitors and require origin plus CSRF',async()=>{
  const first=new Visitor();
  await first.initialize();
  expect((await first.request('/api/demo/start',{method:'POST',body:{},csrf:'invalid'})).status).toBe(419);
  expect((await first.request('/api/demo/start',{method:'POST',body:{},origin:'https://attacker.test'})).status).toBe(419);
  const started=await first.start();
  expect(started.workspace.kind).toBe('demo');
  expect((await first.request('/api/demo/reset',{method:'POST',body:{},csrf:'é'.repeat(64)})).status).toBe(419);
  const auth=await first.request('/api/auth',{host:1});
  expect(auth.status).toBe(200);
  expect((await auth.json()).workspace.id).toBe(first.workspace);
  const resources=await first.request('/api/resources',{host:1});
  expect(resources.status).toBe(200);
  expect((await resources.json()).resources).toHaveLength(4);
  const second=new Visitor();
  await second.start();
  expect(second.workspace).not.toBe(first.workspace);
  expect((await second.request('/api/resources',{workspace:first.workspace})).status).toBe(404);
  expect((await second.request('/api/login',{method:'POST',body:{email:'fixture@example.test',password:'fixture-password'}})).status).toBe(404);
});
test('start keeps fixed expiry and reset preserves visitor identity while refusing old drafts',async()=>{
  const visitor=new Visitor();
  const original=await visitor.start();
  const oldVisitor=new Visitor();
  oldVisitor.cookies=new Map(visitor.cookies);
  oldVisitor.workspace=visitor.workspace;
  const token=visitor.cookies.get('janela_visitor');
  const repeated=await visitor.request('/api/demo/start',{method:'POST',body:{}});
  expect(repeated.status).toBe(200);
  const same=await repeated.json();
  expect(same.workspace.id).toBe(original.workspace.id);
  expect(same.workspace.expiresAt).toBe(original.workspace.expiresAt);
  const reset=await visitor.request('/api/demo/reset',{method:'POST',body:{}});
  expect(reset.status).toBe(200);
  const renewed=await reset.json();
  expect(renewed.workspace.id).not.toBe(original.workspace.id);
  expect(visitor.cookies.get('janela_visitor')).toBe(token);
  expect((await oldVisitor.request('/api/resources',{host:1})).status).toBe(404);
  expect((await visitor.request('/api/resources',{workspace:original.workspace.id})).status).toBe(404);
  visitor.workspace=renewed.workspace.id;
  await visitor.initialize();
  const limited=await visitor.request('/api/demo/reset',{method:'POST',body:{}});
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
  expect((await pool.query('SELECT count(*)::integer AS count FROM workspaces WHERE visitor_id=$1 AND revoked_at IS NULL',[renewed.workspace.visitorId])).rows[0].count).toBe(1);
});
test('expired environments are refused on the second HTTP server and start has an IP quota',async()=>{
  const visitor=new Visitor();
  await visitor.start();
  await pool.query("UPDATE workspaces SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[visitor.workspace]);
  expect((await visitor.request('/api/resources',{host:1})).status).toBe(404);
  await pool.query("DELETE FROM rate_limits WHERE key LIKE 'start:ip:%'");
  const quotaVisitor=new Visitor();
  await quotaVisitor.start();
  for(let count=1;count<10;count++) expect((await quotaVisitor.request('/api/demo/start',{method:'POST',body:{}})).status).toBe(200);
  const limited=await quotaVisitor.request('/api/demo/start',{method:'POST',body:{}});
  expect(limited.status).toBe(429);
  expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0);
});

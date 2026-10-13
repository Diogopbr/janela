import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
import type { Scope } from './scope.js';
import { consumeLimit, lockKey } from './limits.js';
import { seedResources } from '../demo/seed.js';
export interface DemoWorkspace { scope: Scope; expiresAt: string; }
export class DemoService {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
    const client=await this.pool.connect();
    try { await client.query('BEGIN'); const result=await work(client); await client.query('COMMIT'); return result; }
    catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  private async identity(client:PoolClient, token:string):Promise<string> {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(404,'NOT_FOUND','Identidade não encontrada.');
    const hash=createHash('sha256').update(token).digest('hex');
    const visitor=await client.query(`INSERT INTO visitors(id,token_hash) VALUES($1,$2)
      ON CONFLICT(token_hash) DO UPDATE SET token_hash=EXCLUDED.token_hash RETURNING id`,[randomUUID(),hash]);
    return visitor.rows[0].id as string;
  }
  private async create(client:PoolClient,visitorId:string):Promise<DemoWorkspace> {
    const scope:Scope={id:randomUUID(),userId:randomUUID(),kind:'demo',visitorId};
    const workspace=await client.query("INSERT INTO workspaces(id,kind,visitor_id,expires_at) VALUES($1,'demo',$2,clock_timestamp()+interval '24 hours') RETURNING expires_at",[scope.id,visitorId]);
    await client.query('INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',[scope.userId,scope.id,`${scope.userId}@demo.invalid`,'Visitante','disabled']);
    await seedResources(client,scope);
    return {scope,expiresAt:(workspace.rows[0].expires_at as Date).toISOString()};
  }
  async start(token:string,ip:string):Promise<DemoWorkspace> {
    return this.transaction(async client=>{
      await consumeLimit(client,`start:ip:${ip}`,60,10);
      const visitorId=await this.identity(client,token);
      await lockKey(client,`demo:visitor:${visitorId}`);
      const current=await client.query(`SELECT w.id,w.expires_at,u.id AS user_id FROM workspaces w JOIN users u ON u.workspace_id=w.id
        WHERE w.visitor_id=$1 AND w.revoked_at IS NULL AND w.expires_at>clock_timestamp() ORDER BY w.created_at DESC LIMIT 1 FOR SHARE OF w`,[visitorId]);
      if(current.rowCount) return {scope:{id:current.rows[0].id,userId:current.rows[0].user_id,kind:'demo',visitorId},expiresAt:(current.rows[0].expires_at as Date).toISOString()};
      return this.create(client,visitorId);
    });
  }
  async reset(scope:Scope,token:string,ip:string):Promise<DemoWorkspace> {
    return this.transaction(async client=>{
      await lockKey(client,`reset:ip:${ip}`);
      await lockKey(client,`demo:visitor:${scope.visitorId}`);
      const hash=createHash('sha256').update(token).digest('hex');
      const owned=await client.query(`SELECT w.id FROM workspaces w JOIN visitors v ON v.id=w.visitor_id
        JOIN users u ON u.workspace_id=w.id AND u.id=$2
        WHERE w.id=$1 AND w.kind='demo' AND w.visitor_id=$3 AND v.token_hash=$4
        AND w.revoked_at IS NULL AND w.expires_at>clock_timestamp() FOR UPDATE OF w`,[scope.id,scope.userId,scope.visitorId,hash]);
      if(!owned.rowCount) throw new HttpError(404,'NOT_FOUND','Ambiente não encontrado ou encerrado.');
      await consumeLimit(client,`reset:ip:${ip}`,3600,10);
      await consumeLimit(client,`reset:visitor:${scope.visitorId}`,60,1);
      const revoked=await client.query('UPDATE workspaces SET revoked_at=clock_timestamp() WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id',[scope.id]);
      if(!revoked.rowCount) throw new HttpError(404,'NOT_FOUND','Ambiente não encontrado ou encerrado.');
      await client.query('DELETE FROM sessions WHERE workspace_id=$1',[scope.id]);
      return this.create(client,scope.visitorId!);
    });
  }
}

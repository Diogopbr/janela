import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './passwords.js';
import { lockKey } from './limits.js';
import { seedResources } from '../demo/seed.js';
export async function installUser(pool:Pool,input:{email:string;name:string;password:string}):Promise<void>{
  const email=input.email.trim().toLowerCase();
  const name=input.name.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||name.length<3||name.length>120||/[\p{Cc}\p{Cf}]/u.test(name)) throw new Error('Invalid installation email or name');
  const passwordHash=await hashPassword(input.password);
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await lockKey(client,'installation:normal');
    const current=await client.query("SELECT id FROM workspaces WHERE kind='normal' FOR UPDATE");
    const workspaceId:string=current.rows[0]?.id??randomUUID();
    const userId=randomUUID();
    if(!current.rowCount){
      await client.query("INSERT INTO workspaces(id,kind) VALUES($1,'normal')",[workspaceId]);
      await seedResources(client,{id:workspaceId,userId,kind:'normal',visitorId:null});
    }
    await client.query(`INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(workspace_id,email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash`,[userId,workspaceId,email,name,passwordHash]);
    await client.query('DELETE FROM sessions WHERE workspace_id=$1',[workspaceId]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

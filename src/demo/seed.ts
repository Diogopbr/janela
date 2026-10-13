import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Scope } from '../access/scope.js';
export async function seedResources(client: PoolClient, scope: Scope): Promise<void> {
  for (const name of ['Sala Alameda','Sala Brisa','Projetor 01','Kit Áudio 01']) {
    await client.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)',[randomUUID(),scope.id,name]);
  }
}

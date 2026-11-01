import {env} from 'cloudflare:workers';
import catalogue from '../../catalogue.json';
export const dynamic='force-dynamic';
const known=new Set([...catalogue.events.map(e=>e.id),...catalogue.museums.map(m=>'museum:'+m.id)]);
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const digest=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const token=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
async function context(r:Request){const raw=r.headers.get('X-Plan-Token')||'';if(!/^[a-f0-9]{64}$/.test(raw))return null;return {id:await digest(raw),db:env.DB!};}
async function snapshot(c:{id:string,db:D1Database}){const plan=await c.db.prepare('SELECT route,version,updated_by,updated_at FROM plans WHERE id=?').bind(c.id).first<{route:string,version:number,updated_by:string,updated_at:string}>();if(!plan)return null;const [m,s]=await Promise.all([c.db.prepare('SELECT id,name FROM members WHERE plan_id=?').bind(c.id).all(),c.db.prepare('SELECT member_id,event_id,note FROM suggestions WHERE plan_id=?').bind(c.id).all()]);return {...plan,route:JSON.parse(plan.route as string),members:m.results,suggestions:s.results};}
export async function GET(r:Request){try{const c=await context(r);if(!c)return json({error:'Invalid invitation link.'},400);const state=await snapshot(c);return state?json(state):json({error:'This plan was not found. Check your invitation link.'},404);}catch{return json({error:'Could not load your night. Please retry.'},503);}}
export async function POST(r:Request){try{
 if(Number(r.headers.get('content-length')||0)>8000)return json({error:'Request too large.'},413);
 const raw=await r.text();if(raw.length>8000)return json({error:'Request too large.'},413);let body;try{body=JSON.parse(raw);}catch{return json({error:'Invalid request.'},400);}
 const db=env.DB!;const name=typeof body.name==='string'?body.name.trim().slice(0,32):'';
 if(body.action==='create'){
  if(!name)return json({error:'Enter your name.'},400);const invite=token(),id=await digest(invite),secret=token(),memberId=crypto.randomUUID();
  await db.batch([db.prepare('INSERT INTO plans(id,updated_at) VALUES(?,?)').bind(id,new Date().toISOString()),db.prepare('INSERT INTO members(id,plan_id,token_hash,name) VALUES(?,?,?,?)').bind(memberId,id,await digest(secret),name)]);
  return json({invite,memberToken:secret,memberId},201);
 }
 const c=await context(r);if(!c)return json({error:'Invalid invitation link.'},400);
 const state=await snapshot(c);if(!state)return json({error:'This plan was not found.'},404);
 if(body.action==='join'){if(!name)return json({error:'Enter your name.'},400);if(state.members.length>=100)return json({error:'This group is full.'},400);const secret=token(),memberId=crypto.randomUUID();await db.prepare('INSERT INTO members(id,plan_id,token_hash,name) VALUES(?,?,?,?)').bind(memberId,c.id,await digest(secret),name).run();return json({memberToken:secret,memberId});}
 const secret=r.headers.get('X-Member-Token')||'';if(!/^[a-f0-9]{64}$/.test(secret))return json({error:'Join this night to make changes.'},401);
 const member=await db.prepare('SELECT id,name FROM members WHERE plan_id=? AND token_hash=?').bind(c.id,await digest(secret)).first<{id:string,name:string}>();if(!member)return json({error:'Join this night to make changes.'},401);
 if(body.action==='rename'){if(!name)return json({error:'Enter a name.'},400);await db.prepare('UPDATE members SET name=? WHERE id=?').bind(name,member.id).run();}
 else if(body.action==='suggest'){if(!known.has(body.eventId)||typeof body.active!=='boolean')return json({error:'Unknown programme item.'},400);if(body.active)await db.prepare('INSERT INTO suggestions(id,plan_id,member_id,event_id,note) VALUES(?,?,?,?,?) ON CONFLICT(plan_id,member_id,event_id) DO UPDATE SET note=excluded.note').bind(crypto.randomUUID(),c.id,member.id,body.eventId,typeof body.note==='string'?body.note.trim().slice(0,240):'').run();else await db.prepare('DELETE FROM suggestions WHERE plan_id=? AND member_id=? AND event_id=?').bind(c.id,member.id,body.eventId).run();}
 else if(['add','remove','move','timing'].includes(body.action)){
  if(body.version!==state.version)return json({error:'Someone just changed the route. It has been refreshed; please try your change again.'},409);
  let route=state.route as {id:string,arrival:string,duration:number}[];const index=route.findIndex(s=>s.id===body.eventId);
  if(body.action==='add'){if(!known.has(body.eventId))return json({error:'Unknown programme item.'},400);if(index<0){if(route.length>=40)return json({error:'Your route already has 40 stops.'},400);route.push({id:body.eventId,arrival:'',duration:45});}}
  if(body.action==='remove')route=route.filter(s=>s.id!==body.eventId);
  if(body.action==='move'&&index>=0){const dest=index+(body.direction===-1?-1:1);if(dest>=0&&dest<route.length)[route[index],route[dest]]=[route[dest],route[index]];}
  if(body.action==='timing'&&index>=0){if(body.arrival!==''&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.arrival))return json({error:'Use a valid arrival time.'},400);route[index]={...route[index],arrival:body.arrival,duration:Math.min(240,Math.max(10,Number(body.duration)||45))};}
  const result=await db.prepare('UPDATE plans SET route=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(route),member.name,new Date().toISOString(),c.id,body.version).run();if(!result.meta.changes)return json({error:'Someone just changed the route. Please retry.'},409);
 }else return json({error:'Unknown action.'},400);
 return json(await snapshot(c));
 }catch{return json({error:'Your change could not be saved. Please retry.'},503);}}

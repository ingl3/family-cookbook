const {neon}=require('@neondatabase/serverless');
module.exports=async(req,res)=>{
res.setHeader('Cache-Control','no-store');
try{
const sql=neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS family_recipes (id uuid PRIMARY KEY, original jsonb NOT NULL, published jsonb, status text NOT NULL DEFAULT 'pending', created_at timestamptz DEFAULT now(), published_at timestamptz)`;
await sql`CREATE TABLE IF NOT EXISTS family_likes (recipe text NOT NULL, visitor uuid NOT NULL, PRIMARY KEY(recipe,visitor))`;
const action=req.query.action||'list';
if(req.method==='GET'&&action==='list'){const recipes=await sql`SELECT id,published,published_at FROM family_recipes WHERE status='approved' ORDER BY published_at DESC`;const likes=await sql`SELECT recipe,count(*)::int AS count FROM family_likes GROUP BY recipe`;return res.json({recipes,likes})}
if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
const b=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
if(action==='submit'){
const fields=['title','contributor','author','relationship','dedication','heritage','category','servings','prep','cook','ingredients','instructions','wisdom','story'];
const d={};for(const k of fields)d[k]=String(b[k]||'').trim().slice(0,12000);
if(!d.title||!d.contributor||!d.ingredients||!d.instructions)return res.status(400).json({error:'Required fields missing'});
if(b.photo){if(typeof b.photo!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(b.photo)||b.photo.length>2800000)return res.status(400).json({error:'Invalid photo or photo too large'});d.photo=b.photo}
const id=crypto.randomUUID();await sql`INSERT INTO family_recipes(id,original) VALUES(${id},${JSON.stringify(d)}::jsonb)`;return res.status(201).json({id,status:'pending'})}
if(action==='like'){if(!/^(cover|p[0-9]{1,2}|[a-f0-9-]{36})$/.test(b.recipe)||!/^[a-f0-9-]{36}$/.test(b.visitor))return res.status(400).json({error:'Invalid like'});if(b.liked)await sql`INSERT INTO family_likes VALUES(${b.recipe},${b.visitor}) ON CONFLICT DO NOTHING`;else await sql`DELETE FROM family_likes WHERE recipe=${b.recipe} AND visitor=${b.visitor}`;const rows=await sql`SELECT count(*)::int AS count FROM family_likes WHERE recipe=${b.recipe}`;return res.json(rows[0])}
if(action==='moderate'||action==='queue'){const secret=process.env.FAMILY_ADMIN_SECRET;if(!secret||req.headers.authorization!=='Bearer '+secret)return res.status(401).json({error:'Administrator authorization required'});if(action==='queue')return res.json(await sql`SELECT id,original,status,created_at FROM family_recipes ORDER BY created_at DESC`);if(!['approved','archived'].includes(b.status))return res.status(400).json({error:'Invalid status'});await sql`UPDATE family_recipes SET status=${b.status},published=CASE WHEN ${b.status}='approved' THEN original ELSE published END,published_at=CASE WHEN ${b.status}='approved' THEN now() ELSE published_at END WHERE id=${b.id}::uuid`;return res.json({ok:true})}
return res.status(400).json({error:'Unknown action'});
}catch(e){console.error('Family API failure',e.code||e.name);return res.status(500).json({error:'Database operation failed'})}
};
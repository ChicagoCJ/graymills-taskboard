import assert from "node:assert/strict";
import {Pool} from "pg";

// End-to-end local GoTrue Auth + PostgREST + Supabase Storage HTTP checks.
// DISPOSABLE localhost only. Never uses a live Graymills API key or user.
const base=process.env.API_URL||"";
const parsed=new URL(base);
if(!["localhost","127.0.0.1"].includes(parsed.hostname)||parsed.port!=="54321")
  throw Error("Refusing non-local Supabase API.");
const key=process.env.ANON_KEY||"";
const adminKey=process.env.SERVICE_ROLE_KEY||"";
const dbURL=process.env.DB_URL||"";
if(!key||!adminKey||!dbURL||!["127.0.0.1","localhost"].includes(new URL(dbURL).hostname))
  throw Error("Local ephemeral test keys and database required.");
const db=new Pool({connectionString:dbURL});
const seo="22eacfd8-22f8-4c01-a51d-44987facad42";
const unrelated="d0000000-0000-4000-8000-000000000003";
const seoTask="c0000000-0000-4000-8000-000000000004";
const otherTask="c0000000-0000-4000-8000-000000000005";
const pass="ephemeral-ci-only-test-password-no-live-accounts";
const marker={taskboard_integration:"graymills_seo_readonly_v1"};

async function req(path,{token=key,apiKey=key,method="GET",body,headers={}}={}){
  const response=await fetch(base+path,{
    method,
    headers:{
      apikey:apiKey,
      Authorization:"Bearer "+token,
      Accept:"application/json",
      ...(body && typeof body==="object" && !(body instanceof Uint8Array) ? {"content-type":"application/json"}:{}),
      ...headers,
    },
    body:body===undefined?undefined:(body instanceof Uint8Array?body:JSON.stringify(body)),
    redirect:"manual",
    cache:"no-store",
  });
  const text=await response.text();
  let json;try{json=JSON.parse(text)}catch{json=null}
  return {status:response.status,json,text};
}
async function adminCreate(email,app_metadata){
  const r=await req("/auth/v1/admin/users",{
    token:adminKey,apiKey:adminKey,method:"POST",
    body:{email,password:pass,email_confirm:true,app_metadata},
  });
  assert.ok(r.status===200||r.status===201,"Local admin create user failed: "+r.status+" "+r.text.slice(0,300));
  const u=r.json?.user||r.json;
  assert.ok(u?.id,"Local Auth response missing user ID.");
  return u.id;
}
async function login(email){
  const r=await req("/auth/v1/token?grant_type=password",{
    method:"POST",body:{email,password:pass},
  });
  assert.equal(r.status,200,"Local password login failed: "+r.text.slice(0,300));
  assert.ok(r.json?.access_token);
  return r.json.access_token;
}
async function rows(path,token){
  const r=await req("/rest/v1/"+path,{token});
  assert.equal(r.status,200,"REST GET failed: "+r.text.slice(0,300));
  assert.ok(Array.isArray(r.json));
  return r.json;
}
try{
  // SQL restrictions were installed BEFORE GoTrue creates the active Member.
  const integrationId=await adminCreate("isolated-chatgpt@example.test",marker);
  const employeeId=await adminCreate("isolated-employee@example.test",{});
  const session=await login("isolated-chatgpt@example.test");
  const employee=await login("isolated-employee@example.test");
  const sessionInfo=await req("/auth/v1/user",{token:session});
  assert.equal(sessionInfo.status,200);
  assert.equal(sessionInfo.json?.id,integrationId);
  assert.equal(sessionInfo.json?.app_metadata?.taskboard_integration,marker.taskboard_integration);
  const profile=await db.query("SELECT id,role,is_active FROM public.profiles WHERE id IN ($1,$2)",[integrationId,employeeId]);
  assert.equal(profile.rowCount,2,"New-user trigger must have generated both profiles.");
  assert.ok(profile.rows.every(u=>u.role==="member"&&u.is_active===true));
  await db.query("INSERT INTO public.task_assignees(id,task_id,profile_id) VALUES (gen_random_uuid(),$1,$3),(gen_random_uuid(),$2,$3),(gen_random_uuid(),$1,$4),(gen_random_uuid(),$2,$4)",
    [seoTask,otherTask,integrationId,employeeId]);

  const integrationProjects=await rows("projects?select=id&order=id.asc",session);
  assert.deepEqual(integrationProjects.map(p=>p.id),[seo]);
  const integrationTasks=await rows("tasks?select=id&order=id.asc",session);
  assert.deepEqual(integrationTasks.map(t=>t.id),[seoTask]);
  assert.deepEqual(await rows("tasks?select=id&id=eq."+otherTask,session),[]);
  assert.deepEqual((await rows("profiles?select=id",session)).map(p=>p.id),[integrationId]);

  const employeeProjects=await rows("projects?select=id&order=id.asc",employee);
  assert.deepEqual(employeeProjects.map(p=>p.id),[seo,unrelated].sort());
  assert.equal((await rows("tasks?select=id",employee)).length,2);

  const attemptedUpdate=await req("/rest/v1/tasks?id=eq."+seoTask,{
    token:session,method:"PATCH",body:{title:"integration forbidden"},
    headers:{"prefer":"return=representation"},
  });
  assert.ok([200,204].includes(attemptedUpdate.status),"Unexpected PATCH response "+attemptedUpdate.status);
  assert.equal(attemptedUpdate.json?.length??0,0,"Integration must not update a task.");
  const attemptedInsert=await req("/rest/v1/tasks",{
    token:session,method:"POST",
    body:{id:"77777777-7777-4777-8777-777777777777",project_id:seo,title:"forbidden"},
  });
  assert.equal(attemptedInsert.status,403,"Integration task INSERT must be forbidden.");
  const attemptedDelete=await req("/rest/v1/tasks?id=eq."+seoTask,{
    token:session,method:"DELETE",headers:{"prefer":"return=representation"},
  });
  assert.ok([200,204].includes(attemptedDelete.status));
  assert.equal(attemptedDelete.json?.length??0,0,"Integration must not delete a task.");
  const employeePatch=await req("/rest/v1/tasks?id=eq."+otherTask,{
    token:employee,method:"PATCH",body:{title:"employee may edit"},
    headers:{"prefer":"return=representation"},
  });
  assert.equal(employeePatch.status,200,"Employee UPDATE regression: "+employeePatch.text.slice(0,300));
  assert.equal(employeePatch.json?.length,1);

  // Ordinary users can edit user_metadata; they cannot set app_metadata.
  const metaUpdate=await req("/auth/v1/user",{
    token:employee,method:"PUT",body:{data:marker},
  });
  assert.equal(metaUpdate.status,200,"User metadata update failed: "+metaUpdate.text.slice(0,300));
  assert.equal(metaUpdate.json?.user_metadata?.taskboard_integration,marker.taskboard_integration);
  assert.notEqual(metaUpdate.json?.app_metadata?.taskboard_integration,marker.taskboard_integration);

  // Authenticated Storage object upload in own folder: ordinary Member
  // should be able to upload; integration must not upload or overwrite.
  const binary=new Uint8Array(Buffer.from("CI disposable attachment"));
  const employeeFile=employeeId+"/test-attachment.txt";
  const upload=await req("/storage/v1/object/task-attachments/"+employeeFile,{
    token:employee,method:"POST",body:binary,
    headers:{"content-type":"text/plain","x-upsert":"false"},
  });
  assert.ok([200,201].includes(upload.status),"Employee baseline Storage upload failed: "+upload.text.slice(0,400));
  const deniedUpload=await req("/storage/v1/object/task-attachments/"+integrationId+"/forbidden.txt",{
    token:session,method:"POST",body:binary,
    headers:{"content-type":"text/plain","x-upsert":"false"},
  });
  assert.ok([400,401,403].includes(deniedUpload.status),
    "Integration upload must be rejected: "+deniedUpload.status+" "+deniedUpload.text.slice(0,300));
  const deniedOverwrite=await req("/storage/v1/object/task-attachments/"+employeeFile,{
    token:session,method:"POST",body:binary,
    headers:{"content-type":"text/plain","x-upsert":"true"},
  });
  assert.ok([400,401,403].includes(deniedOverwrite.status),
    "Integration overwrite must be rejected.");
  const deniedRead=await req("/storage/v1/object/authenticated/task-attachments/"+employeeFile,{
    token:session,
  });
  assert.ok([400,401,403,404].includes(deniedRead.status),
    "Integration must not download private attachment.");
  const deniedSign=await req("/storage/v1/object/sign/task-attachments/"+employeeFile,{
    token:session,method:"POST",body:{expiresIn:60},
  });
  assert.ok([400,401,403,404].includes(deniedSign.status),
    "Integration must not create private file signed URL.");
  const deniedRemove=await req("/storage/v1/object/task-attachments/"+employeeFile,{
    token:session,method:"DELETE",
  });
  assert.ok([400,401,403,404].includes(deniedRemove.status),
    "Integration must not delete file through Storage.");
  console.log("PASS: real isolated Supabase Auth sign-in and app_metadata, TaskBoard REST read-only restrictions, employee access, authenticated Storage upload/download/signed URL denials.");
  console.log("LIMITATION: full real production schema & OAuth MCP connector remain untested; all changes local-only.");
}finally{await db.end();}

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// Only local disposable PostgREST: NEVER direct mutation probes at live Supabase.
// CI starts a real PostgREST server over the disposable policy-replay database.
const host = "http://127.0.0.1:3002";
const secret = "disposable-postgrest-jwt-secret-ci-2026-only";
const integrationId = "f0000000-0000-4000-8000-000000000001";
const employeeId = "e0000000-0000-4000-8000-000000000002";
const seoId = "22eacfd8-22f8-4c01-a51d-44987facad42";
const otherId = "d0000000-0000-4000-8000-000000000003";
const seoTask = "c0000000-0000-4000-8000-000000000004";
const otherTask = "c0000000-0000-4000-8000-000000000005";
function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function token(sub, app_metadata = {}, user_metadata = {}) {
  const payload = {
    sub, role:"authenticated", aud:"authenticated",
    app_metadata, user_metadata,
    iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+180,
  };
  const header = encode({alg:"HS256",typ:"JWT"});
  const body = encode(payload);
  const signature = createHmac("sha256", secret).update(header+"."+body).digest("base64url");
  return header+"."+body+"."+signature;
}
async function call(path, jwt, options={}) {
  const response=await fetch(new URL(path, host),{
    ...options,
    headers:{
      "authorization":"Bearer "+jwt,
      "accept":"application/json",
      "content-type":"application/json",
      "prefer":"return=representation",
      ...options.headers,
    },
    redirect:"manual",
    cache:"no-store",
  });
  const body=await response.text();
  return {status:response.status,body};
}
let healthy=false;
for(let i=0;i<30;i++){
  try {
    const r=await fetch(host+"/",{redirect:"manual"});
    if(r.status!==503){healthy=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
}
assert.ok(healthy,"Local PostgREST server must become reachable.");
const marked=token(integrationId,{taskboard_integration:"graymills_seo_readonly_v1"});
const member=token(employeeId);
const forged=token(employeeId,{}, {taskboard_integration:"graymills_seo_readonly_v1"});
const intruder=token(integrationId,{taskboard_integration:"graymills_seo_readonly_v1"}, {role:"admin"});
for(const [label,jwt] of [["integration",marked],["employee",member],["user_metadata forged",forged],["role forged",intruder]]){
  const project=await call("/projects?select=id&order=id.asc",jwt);
  assert.equal(project.status,200,label+" must have successful project query: "+project.body);
  const ids=JSON.parse(project.body).map(x=>x.id);
  assert.deepEqual(ids,label==="integration"||label==="role forged"?[seoId]:[otherId,seoId].sort(),
    label+" project list must match permitted scope.");
}
const tasks=await call("/tasks?select=id,project_id&order=id.asc",marked);
assert.equal(tasks.status,200,tasks.body);
assert.deepEqual(JSON.parse(tasks.body).map(x=>x.id),[seoTask]);
const unrelated=await call("/tasks?select=id&id=eq."+otherTask,marked);
assert.equal(unrelated.status,200);
assert.deepEqual(JSON.parse(unrelated.body),[],"Integration cannot read another project even if task ID known.");
const patch=await call("/tasks?id=eq."+seoTask,marked,{
  method:"PATCH",body:JSON.stringify({title:"should-not-persist"}),
});
assert.ok([200,204].includes(patch.status),"PATCH response must be no-op, got "+patch.status+": "+patch.body);
assert.equal(patch.status===204?0:JSON.parse(patch.body).length,0,
  "Integration must not update rows even through HTTP REST.");
const remove=await call("/tasks?id=eq."+seoTask,marked,{method:"DELETE"});
assert.ok([200,204].includes(remove.status),remove.body);
assert.equal(remove.status===204?0:JSON.parse(remove.body).length,0,
  "Integration must not DELETE tasks.");
const create=await call("/tasks",marked,{
  method:"POST",
  body:JSON.stringify({id:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",project_id:seoId}),
});
assert.equal(create.status,403,"Integration cannot INSERT tasks: "+create.body);
const employeePatch=await call("/tasks?id=eq."+otherTask,member,{
  method:"PATCH",body:JSON.stringify({title:"employee-allowed"}),
});
assert.equal(employeePatch.status,200,employeePatch.body);
assert.equal(JSON.parse(employeePatch.body).length,1,
  "Ordinary Member's assigned-task edit must still succeed.");
const invalid=await call("/projects?select=id",marked.slice(0,-8)+"tampered");
assert.equal(invalid.status,401,"Tampered JWT must be rejected by PostgREST.");
console.log("PASS: real disposable PostgREST API enforces marked identity scope, read-only CRUD, employee access and JWT signature.");
console.log("LIMITATION: no live Supabase Auth account, GoTrue, Storage HTTP or production changes.");

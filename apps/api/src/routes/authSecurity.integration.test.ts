import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import express from "express";
import pg from "pg";
import { pool } from "../db/pool.js";
import { runMigrations } from "../db/migrations.js";
import { hashPassword } from "../auth/passwords.js";
import { limiterAction, reserveLogin, loginCleanupIntervalMs } from "../auth/loginLimiter.js";
import { currentUser } from "../middleware/currentUser.js";
import { requestSecurity } from "../middleware/requestSecurity.js";
import { authRouter } from "./auth.js";
import { createManagerTechniciansRouter, ManagerTechnicianError } from "./managerTechnicians.js";
import { inspectionJobsRouter } from "./inspectionJobs.js";

test("security remediation HTTP and durable concurrent budgets", async (t) => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.equal(process.env.DATABASE_URL, process.env.SEED_INTEGRATION_DATABASE_URL);
  const url = new URL(process.env.SEED_INTEGRATION_DATABASE_URL!);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55432"); assert.equal(url.pathname, "/phase6_seed_integration");
  const password = "disposable-test-password";
  const app = express(); app.use(requestSecurity); app.use(express.json()); app.use(currentUser); app.use(authRouter);
  app.use(createManagerTechniciansRouter(pool)); app.use(inspectionJobsRouter);
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error instanceof SyntaxError ? 400 : error instanceof ManagerTechnicianError ? error.status : 500).json({error: error instanceof ManagerTechnicianError ? error.code : "INTERNAL_SERVER_ERROR"});
  });
  const server = app.listen(0, "127.0.0.1"); await once(server,"listening");
  const origin = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const request = (path: string, method = "GET", body?: unknown, cookie = "", headers: Record<string,string> = {}) => fetch(origin+path, {method, headers:{"content-type":"application/json",cookie,...headers}, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  const login = (username: string, pass = password, headers: Record<string,string> = {}) => request("/auth/login","POST",{username,password:pass},"",headers);
  const cookie = (res: Response) => res.headers.get("set-cookie")!.split(";")[0]!;
  const clear = () => pool.query("DELETE FROM audit_events WHERE action=$1",[limiterAction]);
  let cleanupTick = performance.now();
  const advanceCleanup = () => {
    cleanupTick = Math.max(cleanupTick, performance.now()) + loginCleanupIntervalMs + 1;
    const tick = cleanupTick;
    return t.mock.method(performance, "now", () => tick);
  };
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); await runMigrations(pool);
    const hash = await hashPassword(password);
    const users = (await pool.query("INSERT INTO users(username,password_hash,role,is_active) VALUES('security-admin',$1,'admin',true),('security-supervisor',$1,'supervisor',true),('security-a',$1,'inspector',true),('security-b',$1,'inspector',true),('security-inactive',$1,'inspector',false) RETURNING id,username",[hash])).rows;
    await t.test("payload validation and generic failures never create sessions",async () => {
      for (const body of [null,[],{}, {username:1,password}, {username:"security-a",password:"x".repeat(1025)}, {username:"x".repeat(129),password}, {username:"security-a",password,role:"admin"}]) assert.equal((await request("/auth/login","POST",body)).status,400);
      for (const username of ["security-a","missing","security-inactive"]) { const res=await login(username,"incorrect"); assert.equal(res.status,401); assert.deepEqual(await res.json(),{error:"INVALID_CREDENTIALS"}); assert.equal(res.headers.get("set-cookie"),null); }
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_sessions")).rows[0].n,0);
    });
    await clear();
    await t.test("account cooldown cannot be evaded with forwarding headers; expiry recovers",async () => {
      for(let i=0;i<8;i++) assert.equal((await login(" security-a ","incorrect",{"x-forwarded-for":`192.0.2.${i}`,"cf-connecting-ip":`192.0.2.${i}`})).status,401);
      const res=await login("security-a"); assert.equal(res.status,429); assert(Number(res.headers.get("retry-after"))>0); assert.equal(res.headers.get("set-cookie"),null);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action=$1",[limiterAction])).rows[0].n,8);
      await pool.query("UPDATE audit_events SET created_at=now()-interval '11 minutes' WHERE action=$1",[limiterAction]);
      const clock = advanceCleanup();
      try { assert.equal((await login("security-a")).status,200); } finally { clock.mock.restore(); }
    });
    await clear();
    await t.test("independent workers, IP rotation, new-pool persistence and shared-network success",async () => {
      const other = new pg.Pool({connectionString:url.toString()});
      try {
        for(let batch=0;batch<2;batch++) {
          const leases=await Promise.all(Array.from({length:4},(_,i)=>reserveLogin(i%2?other:pool,"distributed-account",`192.0.2.${batch*4+i}`)));
          assert(leases.every(lease=>typeof lease!=="number"));
          assert.equal(await reserveLogin(other,"different-account","192.0.2.99"),1,"hash slots bounded across pools");
          for(const lease of leases) if(typeof lease!=="number") await lease.release();
        }
        assert.equal(typeof await reserveLogin(other,"distributed-account","192.0.2.200"),"number");
        await other.end();
        const restarted=new pg.Pool({connectionString:url.toString()});
        try { assert.equal(typeof await reserveLogin(restarted,"distributed-account","192.0.2.201"),"number"); } finally { await restarted.end(); }
      } finally { if(!other.ended) await other.end(); }
      await clear();
      for(const name of ["security-admin","security-supervisor","security-a","security-b"]) assert.equal((await login(name)).status,200);
    });
    await clear();
    await t.test("random identities bounded by peer/global budgets; expired counters pruned",async () => {
      for(let i=0;i<120;i++) { const lease=await reserveLogin(pool,`random-${i}`,"shared-peer"); assert.notEqual(typeof lease,"number"); if(typeof lease!=="number") await lease.release(); }
      assert.equal(typeof await reserveLogin(pool,"new-random","shared-peer"),"number");
      for(let i=120;i<300;i++) {const lease=await reserveLogin(pool,`random-${i}`,`peer-${i}`); assert.notEqual(typeof lease,"number"); if(typeof lease!=="number") await lease.release();}
      assert.equal(typeof await reserveLogin(pool,"random-301","peer-301"),"number");
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action=$1",[limiterAction])).rows[0].n,300);
      await pool.query("INSERT INTO audit_events(action,result,created_at) VALUES($1,'failure',now()-interval '11 minutes'),('security-history-probe','failure',now()-interval '11 minutes')", [limiterAction]);
      const deniedClock = advanceCleanup();
      try {
        assert.equal(typeof await reserveLogin(pool, "still-denied", "fresh-peer"), "number");
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action=$1", [limiterAction])).rows[0].n, 300, "denied admission commits expired cleanup");
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action='security-history-probe'")).rows[0].n, 1, "ordinary audit history is retained");
      } finally { deniedClock.mock.restore(); }
      await pool.query("UPDATE audit_events SET created_at=now()-interval '11 minutes' WHERE action=$1",[limiterAction]);
      const clock = advanceCleanup();
      try {
        const lease=await reserveLogin(pool,"after-expiry","shared-peer"); assert.notEqual(typeof lease,"number"); if(typeof lease!=="number") await lease.release();
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action=$1",[limiterAction])).rows[0].n,1);
      } finally { clock.mock.restore(); }
    });
    await clear();
    await t.test("real session cookies, malformed/duplicate cookies, authority, CSRF and lifecycle",async () => {
      const adminLogin=await login("security-admin"), techLogin=await login("security-a"), supervisorLogin=await login("security-supervisor");
      assert.match(adminLogin.headers.get("set-cookie")!,/HttpOnly/); assert.match(adminLogin.headers.get("set-cookie")!,/Secure/); assert.match(adminLogin.headers.get("set-cookie")!,/SameSite=Lax/);
      const admin=cookie(adminLogin), tech=cookie(techLogin), supervisor=cookie(supervisorLogin);
      for(const bad of ["","inspection_session=%ZZ","inspection_session="+"A".repeat(43),`${admin}; ${tech}`,`${admin}; ${admin}`]) {const res=await request("/auth/me","GET",undefined,bad); assert.equal(res.status,401); assert(!await res.text().then(x=>x.includes("stack")));}
      assert.equal((await request("/auth/me","GET",undefined,`broken=%ZZ; ${tech}`)).status,200);
      const me=await request("/auth/me","GET",undefined,tech,{"x-role":"admin","x-user-id":String(users[0].id)}); assert.equal((await me.json()).user.role,"inspector"); assert.equal(me.headers.get("cache-control"),"private, no-store");
      for(const actor of [tech,supervisor]) for(const path of ["/manager/technicians",`/manager/technicians/${users[3].id}/password`,`/manager/technicians/${users[3].id}/deactivate`]) assert.equal((await request(path,"POST",{},actor,{"x-role":"admin"})).status,403);
      for(const headers of [{origin:"https://sibling.invalid"},{"sec-fetch-site":"same-site"},{"sec-fetch-site":"cross-site"},{origin:"null"}] as Record<string,string>[]) assert.equal((await request("/auth/logout","POST",undefined,tech,headers)).status,403);
      assert.equal((await request("/auth/me","GET",undefined,tech)).status,200);
      assert.equal((await request("/auth/logout","POST",undefined,tech)).status,200);
      assert.equal((await request("/auth/me","GET",undefined,tech)).status,401);
      const b=cookie(await login("security-b"));
      assert.equal((await request(`/manager/technicians/${users[3].id}/password`,"POST",{password:"new-disposable-password"},admin)).status,200);
      assert.equal((await request("/auth/me","GET",undefined,b)).status,401);
      const deactivated=cookie(await login("security-b","new-disposable-password"));
      assert.equal((await request(`/manager/technicians/${users[3].id}/deactivate`,"POST",{},admin)).status,200);
      assert.equal((await request("/auth/me","GET",undefined,deactivated)).status,401);
      await pool.query("UPDATE users SET is_active=true WHERE id=$1",[users[3].id]);
      assert.equal((await request("/auth/me","GET",undefined,deactivated)).status,401,"reactivation must not revive old sessions");
      await pool.query("UPDATE user_sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",[users[1].id]);
      assert.equal((await request("/inspection-jobs","GET",undefined,supervisor)).status,401);
    });
    await clear();
    await t.test("HTTP origin validation rejects opposite schemes even without Fetch Metadata", async () => {
      const actor = cookie(await login("security-admin"));
      assert.equal((await request("/auth/logout", "POST", undefined, actor, { origin })).status, 403);
      assert.equal((await request("/auth/me", "GET", undefined, actor)).status, 200);
      assert.equal((await request("/auth/logout", "POST", undefined, actor, { origin: origin.replace("http:", "https:") })).status, 200);
    });
    await t.test("login/reset/deactivation races enforce both lock orderings", { timeout: 60_000 }, async () => {
      const admin = cookie(await login("security-admin"));
      // Intercept only explicit client acquisitions, preserving pg's callback
      // acquisition path used by pool.query. Restore each client before reuse.
      async function holdLogin(sqlFragment: string) {
        let reached!: () => void, resume!: () => void;
        const reachedPromise = new Promise<void>(resolve => { reached = resolve; });
        const gate = new Promise<void>(resolve => { resume = resolve; });
        const connect = pool.connect;
        let held = false;
        const intercept = t.mock.method(pool, "connect", (...args: unknown[]) => {
          if (args.length) return Reflect.apply(connect, pool, args);
          return (Reflect.apply(connect, pool, []) as Promise<pg.PoolClient>).then(client => {
            const query = client.query, release = client.release;
            client.query = ((...queryArgs: unknown[]) => {
              if (!held && typeof queryArgs[0] === "string" && queryArgs[0].includes(sqlFragment)) {
                held = true; reached();
                return gate.then(() => Reflect.apply(query, client, queryArgs));
              }
              return Reflect.apply(query, client, queryArgs);
            }) as typeof client.query;
            client.release = (...releaseArgs) => {
              client.query = query; client.release = release;
              Reflect.apply(release, client, releaseArgs);
            };
            return client;
          });
        });
        return { reached: reachedPromise, resume, restore: () => intercept.mock.restore() };
      }
      async function waitForUserLock() {
        const deadline = Date.now() + 10_000;
        while (Date.now() < deadline) {
          const blocked = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE users SET %' LIMIT 1");
          if (blocked.rows.length) return;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.fail("manager mutation never reached the user-row lock");
      }
      for (const action of ["password", "deactivate"] as const) {
        for (const ordering of ["mutation-first", "login-first"] as const) {
          const username = `race-${action}-${ordering}`;
          const user = (await pool.query("INSERT INTO users(username,password_hash,role) VALUES($1,$2,'inspector') RETURNING id", [username, hash])).rows[0];
          const barrier = await holdLogin(ordering === "mutation-first" ? "FOR SHARE" : "INSERT INTO user_sessions");
          const pendingLogin = login(username);
          let pendingMutation: Promise<Response> | undefined;
          let barrierTimeout: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([barrier.reached, new Promise<never>((_resolve, reject) => {
              barrierTimeout = setTimeout(() => reject(new Error(`login never reached ${ordering} barrier`)), 10_000);
            })]);
            clearTimeout(barrierTimeout);
            pendingMutation = request(`/manager/technicians/${user.id}/${action}`, "POST", action === "password" ? { password: "race-new-disposable-password" } : {}, admin);
            if (ordering === "mutation-first") assert.equal((await pendingMutation).status, 200);
            else await waitForUserLock();
            barrier.resume();
            const result = await pendingLogin;
            assert.equal(result.status, ordering === "mutation-first" ? 401 : 200, `${action}/${ordering}`);
            assert.equal((await pendingMutation).status, 200);
            if (ordering === "login-first") {
              const oldCookie = cookie(result);
              assert.equal((await request("/auth/me", "GET", undefined, oldCookie)).status, 401);
              if (action === "deactivate") {
                await pool.query("UPDATE users SET is_active=true WHERE id=$1", [user.id]);
                assert.equal((await request("/auth/me", "GET", undefined, oldCookie)).status, 401);
              }
            } else assert.equal(result.headers.get("set-cookie"), null);
            assert.equal((await pool.query("SELECT count(*)::int AS n FROM user_sessions WHERE user_id=$1 AND revoked_at IS NULL", [user.id])).rows[0].n, 0);
          } finally {
            clearTimeout(barrierTimeout);
            barrier.resume(); barrier.restore();
            await Promise.allSettled([pendingLogin, ...(pendingMutation ? [pendingMutation] : [])]);
          }
        }
      }
    });
    await t.test("deactivation audit failure rolls back account and session revocation", async () => {
      const admin = cookie(await login("security-admin"));
      const actor = cookie(await login("security-a"));
      await pool.query("CREATE FUNCTION reject_security_deactivate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='manager_technician_deactivated' THEN RAISE EXCEPTION 'disposable audit fault'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_security_deactivate BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_security_deactivate();");
      try {
        assert.equal((await request(`/manager/technicians/${users[2].id}/deactivate`, "POST", {}, admin)).status, 500);
        assert.equal((await request("/auth/me", "GET", undefined, actor)).status, 200);
        assert.equal((await pool.query("SELECT is_active FROM users WHERE id=$1", [users[2].id])).rows[0].is_active, true);
      } finally { await pool.query("DROP TRIGGER reject_security_deactivate ON audit_events; DROP FUNCTION reject_security_deactivate();"); }
    });
    await clear();
    await t.test("actual worker termination releases leases without refunding durable attempts", { timeout: 30_000 }, async () => {
      const imports = "import {pool} from './src/db/pool.ts'; import {reserveLogin} from './src/auth/loginLimiter.ts';";
      const launch = (code: string) => spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", imports + code], { env: { ...process.env }, stdio: ["ignore", "ignore", "pipe", "ipc"] });
      const crashed = launch("const leases=await Promise.all(Array.from({length:4},()=>reserveLogin(pool,'crashed-worker-account','restart-peer')));if(leases.some(x=>typeof x==='number'))throw new Error('leases not acquired');process.send({ready:true});await new Promise(()=>{});");
      const exit = once(crashed, "exit");
      try {
        const ready = await Promise.race([once(crashed, "message"), exit.then(() => { throw new Error("worker exited before reservation"); })]);
        assert.deepEqual(ready[0], { ready: true });
        crashed.kill("SIGKILL");
        await exit;
        const deadline = Date.now() + 5_000;
        while ((await pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database()) AND classid=17293651 AND objid BETWEEN 1 AND 4 LIMIT 1")).rows.length) {
          assert(Date.now() < deadline, "terminated worker retained a hash lease");
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        const replacement = launch("try{const leases=await Promise.all(Array.from({length:4},()=>reserveLogin(pool,'crashed-worker-account','restart-peer')));if(leases.some(x=>typeof x==='number'))throw new Error('replacement leases unavailable');for(const lease of leases)await lease.release();const blocked=await reserveLogin(pool,'crashed-worker-account','another-peer');if(typeof blocked!=='number'||blocked<=1)throw new Error('durable account budget lost');process.send({blocked:true});}finally{await pool.end();process.disconnect();}");
        const replacementExit = once(replacement, "exit");
        try {
          const result = await Promise.race([once(replacement, "message"), replacementExit.then(() => { throw new Error("replacement exited without budget proof"); })]);
          assert.deepEqual(result[0], { blocked: true });
          assert.equal((await replacementExit)[0], 0);
        } finally { if (replacement.exitCode === null) replacement.kill("SIGKILL"); }
        assert.equal((await pool.query("SELECT count(*)::int AS n FROM audit_events WHERE action=$1", [limiterAction])).rows[0].n, 8);
      } finally { if (crashed.exitCode === null) crashed.kill("SIGKILL"); }
    });
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); await pool.end(); }
});

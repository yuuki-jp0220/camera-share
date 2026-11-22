// Camera Share administrator gate for Cloudflare Workers.
// Configure ADMIN_PASSWORD and SESSION_SECRET as Worker Secrets in the Cloudflare dashboard.
// Never put either secret in this file or in GitHub.
const APP_HTML = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Camera Share - 管理サイト</title>
<link rel="stylesheet" href="https://yuuki-jp0220.github.io/camera-share/p2p/style.css">
<style>
body{margin:0} .topbar{max-width:1000px;margin:12px auto;padding:0 16px;display:flex;justify-content:flex-end}
.topbar form{margin:0}.topbar button{padding:8px 14px;border:1px solid #64748b;border-radius:8px;background:transparent;cursor:pointer}
</style></head><body>
<div class="topbar"><form method="post" action="/logout"><button type="submit">ログアウト</button></form></div>
<main><h1>🔐 管理サイト（P2P）</h1>
<section><h2>送信端末のコードを貼り付け</h2>
<textarea id="remoteOffer" placeholder="送信サイトの管理用コードを貼り付け"></textarea>
<button id="makeAnswer">回答コードを作成</button>
<textarea id="localAnswer" placeholder="作成した回答コード"></textarea>
<button data-copy="localAnswer">回答コードをコピー</button><p id="status">未接続</p></section>
<section><h2>管理者プレビュー</h2><video id="remoteVideo" autoplay playsinline controls></video>
<h2>public公開設定（管理者側）</h2>
<label><input type="checkbox" id="av" checked> 映像をpublicに公開</label>
<label><input type="checkbox" id="aa" checked> 音声をpublicに公開</label>
<p>ここをOFFにしても管理者プレビューには影響しません。</p></section></main>
<script src="https://yuuki-jp0220.github.io/camera-share/p2p/p2p.js"></script>
<script>CameraShare.init("admin");</script></body></html>`;

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
const unhex = value => Uint8Array.from(value.match(/.{2}/g)||[], pair => parseInt(pair,16));
const enc = value => hex(new TextEncoder().encode(value));
const dec = value => new TextDecoder().decode(unhex(value));
async function sign(value, secret) {
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return hex(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))));
}
async function validSession(request, env) {
 const cookie=request.headers.get("Cookie")||"";
 const match=cookie.match(/(?:^|; )cs_admin_session=([^;]+)/);
 if(!match||!env.SESSION_SECRET)return false;
 try {
  const [payload,signature]=match[1].split(".");
  if(!payload||!signature||await sign(payload,env.SESSION_SECRET)!==signature)return false;
  const data=JSON.parse(dec(payload));
  return Number(data.exp)>Math.floor(Date.now()/1000);
 } catch { return false; }
}
const page=(body,status=200,headers={})=>new Response(body,{status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",...headers}});
const loginPage=(error="")=>page(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>管理者認証 - Camera Share</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#101827;color:#f8fafc;font-family:system-ui,sans-serif}
form{width:min(100%,390px);padding:26px;border:1px solid #40506a;border-radius:16px;background:#1d293b}
h1{font-size:1.35rem}p{line-height:1.6;color:#cbd5e1}input{width:100%;padding:13px;margin:10px 0 14px;border:1px solid #718096;border-radius:8px;font-size:1rem}
button{width:100%;padding:13px;border:0;border-radius:8px;background:#3b82f6;color:white;font-weight:700;font-size:1rem}.err{color:#fca5a5;min-height:1.4em}
</style><form method="post" action="/login"><h1>🔐 管理者認証</h1><p>管理サイトを開くには管理者パスワードを入力してください。</p>
<label for="password">管理者パスワード</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">認証して開く</button><p class="err">${error}</p></form></html>`);
export default {
 async fetch(request,env) {
  const url=new URL(request.url);
  if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return page("Worker Secrets ADMIN_PASSWORD / SESSION_SECRET が未設定です。Cloudflareの設定を確認してください。",503);
  if(url.pathname==="/login"&&request.method==="POST") {
   if(request.headers.get("Origin")!==url.origin)return new Response("Forbidden",{status:403});
   const form=await request.formData();
   const submitted=String(form.get("password")||"");
   if(submitted!==env.ADMIN_PASSWORD)return loginPage("パスワードが違います。もう一度入力してください。",401);
   const payload=enc(JSON.stringify({exp:Math.floor(Date.now()/1000)+8*60*60}));
   const signature=await sign(payload,env.SESSION_SECRET);
   return new Response(null,{status:303,headers:{Location:"/admin","Set-Cookie":`cs_admin_session=${payload}.${signature}; Path=/; Max-Age=28800; HttpOnly; Secure; SameSite=Strict`,"Cache-Control":"no-store"}});
  }
  if(url.pathname==="/logout"&&request.method==="POST")return new Response(null,{status:303,headers:{Location:"/","Set-Cookie":"cs_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict","Cache-Control":"no-store"}});
  if(url.pathname==="/admin") {
   if(!(await validSession(request,env)))return loginPage();
   return page(APP_HTML);
  }
  if(url.pathname==="/"||url.pathname==="/login")return loginPage();
  return new Response("Not Found",{status:404});
 }
};
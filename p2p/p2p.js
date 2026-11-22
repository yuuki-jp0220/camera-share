/* Camera Share P2P - manual signaling, direct WebRTC, same-LAN prototype */
const CameraShare=(()=>{
 let role,media=null,adminPC=null,publicPC=null,adminDC=null,publicDC=null;
 let senderVideo=true,senderAudio=true,adminVideo=true,adminAudio=true;
 const $=id=>document.getElementById(id);
 const say=(id,msg)=>{const e=$(id);if(e)e.textContent=msg};
 const pack=o=>btoa(unescape(encodeURIComponent(JSON.stringify(o))));
 const unpack=s=>JSON.parse(decodeURIComponent(escape(atob(s.trim()))));
 const waitIce=pc=>new Promise(resolve=>{
  if(pc.iceGatheringState==="complete")return resolve();
  let done=false;const finish=()=>{if(done)return;done=true;pc.removeEventListener("icegatheringstatechange",check);resolve()};
  const check=()=>{if(pc.iceGatheringState==="complete")finish()};
  pc.addEventListener("icegatheringstatechange",check);setTimeout(finish,15000);
 });
 const publicAllowed=()=>({video:senderVideo&&adminVideo,audio:senderAudio&&adminAudio});
 function sendPublicFlags(){const f=publicAllowed();if(publicDC&&publicDC.readyState==="open")publicDC.send(JSON.stringify({type:"visibility",...f}))}
 function applySenderTracks(){
  if(publicPC){for(const s of publicPC.getSenders()){if(!s.track)continue;s.track.enabled=s.track.kind==="video"?(senderVideo&&adminVideo):(senderAudio&&adminAudio)}}
  sendPublicFlags();
 }
 function makePeer(which){
  const pc=new RTCPeerConnection({iceServers:[]});
  if(which==="admin"){
   adminPC=pc;
   adminDC=pc.createDataChannel("admin-control");
   adminDC.onopen=()=>{say("adminState","管理端末 接続済み");adminDC.send(JSON.stringify({type:"hello"}))};
   adminDC.onmessage=e=>{try{const d=JSON.parse(e.data);if(d.type==="public-settings"){adminVideo=!!d.video;adminAudio=!!d.audio;applySenderTracks()}}catch(_){}};
   pc.onconnectionstatechange=()=>say("adminState","管理端末："+pc.connectionState);
  }else{
   publicPC=pc;
   publicDC=pc.createDataChannel("public-state");
   publicDC.onopen=()=>{say("publicState","公開端末 接続済み");sendPublicFlags()};
   pc.onconnectionstatechange=()=>say("publicState","公開端末："+pc.connectionState);
  }
  if(media){
   if(which==="admin")media.getTracks().forEach(t=>pc.addTrack(t,media));
   else media.getTracks().forEach(t=>{const clone=t.clone();clone.enabled=t.kind==="video"?(senderVideo&&adminVideo):(senderAudio&&adminAudio);pc.addTrack(clone,new MediaStream([clone]))});
  }
  return pc;
 }
 async function offer(which){
  if(!media){say(which+"State","先にカメラ・マイクを開始してください");return}
  try{
   const pc=makePeer(which),o=await pc.createOffer();await pc.setLocalDescription(o);say(which+"State","接続コードを作成中…");await waitIce(pc);
   $(which+"Offer").value=pack(pc.localDescription);say(which+"State","コード作成済み。相手に渡してください");
  }catch(e){say(which+"State","作成エラー："+e.message)}
 }
 async function accept(which){
  try{const pc=which==="admin"?adminPC:publicPC;if(!pc)throw Error("先に接続コードを作成してください");await pc.setRemoteDescription(unpack($(which+"Answer").value));say(which+"State","回答を登録しました。接続待ち…")}
  catch(e){say(which+"State","登録エラー："+e.message)}
 }
 async function startSender(){
  $("start").onclick=async()=>{
   try{media=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720}},audio:true});$("preview").srcObject=media;$("start").disabled=true;$("stop").disabled=false;$("makeAdmin").disabled=$("makePublic").disabled=false;say("status","カメラ・マイク開始。接続コードを作成できます。")}
   catch(e){say("status","開始できません："+e.message)}
  };
  $("stop").onclick=()=>{[adminPC,publicPC].forEach(p=>{try{p?.close()}catch(_){}});adminPC=publicPC=null;adminDC=publicDC=null;media?.getTracks().forEach(t=>t.stop());media=null;$("preview").srcObject=null;$("start").disabled=false;$("stop").disabled=true;$("makeAdmin").disabled=$("makePublic").disabled=true;say("status","停止しました。再接続には新しいコードが必要です。")};
  $("makeAdmin").onclick=()=>offer("admin");$("makePublic").onclick=()=>offer("public");
  $("acceptAdmin").onclick=()=>accept("admin");$("acceptPublic").onclick=()=>accept("public");
  $("sv").onchange=()=>{senderVideo=$("sv").checked;applySenderTracks()};
  $("sa").onchange=()=>{senderAudio=$("sa").checked;applySenderTracks()};
 }
 async function startReceiver(){
  $("makeAnswer").onclick=async()=>{
   try{
    const pc=new RTCPeerConnection({iceServers:[]});
    pc.ontrack=e=>{const v=$("remoteVideo");if(!v.srcObject)v.srcObject=new MediaStream();if(!v.srcObject.getTracks().some(t=>t.id===e.track.id))v.srcObject.addTrack(e.track);v.play().catch(()=>{})};
    pc.ondatachannel=e=>{
     const dc=e.channel;
     if(role==="admin"){adminDC=dc;dc.onopen=()=>{say("status","送信端末に接続しました");sendAdminSettings()};dc.onmessage=()=>{}}
     else{publicDC=dc;dc.onmessage=ev=>{try{const d=JSON.parse(ev.data);if(d.type==="visibility"){const v=$("remoteVideo");v.hidden=!d.video;v.muted=!d.audio;const hint=$("visibility");if(hint)hint.textContent=(d.video?"映像公開中":"映像は非公開")+" ／ "+(d.audio?"音声公開中":"音声は非公開");if(d.audio){const p=$("playAudio");if(p)p.hidden=false}else{const p=$("playAudio");if(p)p.hidden=true}}}catch(_){}}};
    };
    pc.onconnectionstatechange=()=>say("status","接続状態："+pc.connectionState);
    await pc.setRemoteDescription(unpack($("remoteOffer").value));
    const a=await pc.createAnswer();await pc.setLocalDescription(a);await waitIce(pc);
    $("localAnswer").value=pack(pc.localDescription);window._cameraSharePeer=pc;say("status","回答コード作成済み。送信サイトへ戻して登録してください。");
   }catch(e){say("status","接続エラー："+e.message)}
  };
  function sendAdminSettings(){if(adminDC?.readyState==="open")adminDC.send(JSON.stringify({type:"public-settings",video:$("av").checked,audio:$("aa").checked}))}
  if(role==="admin"){$("av").onchange=sendAdminSettings;$("aa").onchange=sendAdminSettings}
  if(role==="public"){$("playAudio")?.addEventListener("click",()=>{$("remoteVideo").muted=false;$("remoteVideo").play().catch(()=>{})})}
 }
 function init(r){role=r;document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{const el=$(b.dataset.copy);try{await navigator.clipboard.writeText(el.value);say("status","コピーしました")}catch(_){el.select();document.execCommand("copy");say("status","コピー操作を試しました")}}));if(role==="sender")startSender();else startReceiver()}
 return {init};
})();
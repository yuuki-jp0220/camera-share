import os,time,secrets,threading
from collections import deque
from functools import wraps
from flask import Flask,request,jsonify,session,send_from_directory,Response
from werkzeug.security import generate_password_hash,check_password_hash
app=Flask(__name__,static_folder="static")
app.secret_key=os.environ.get("FLASK_SECRET",secrets.token_hex(32))
ADMIN_HASH=generate_password_hash(os.environ.get("ADMIN_PASSWORD","change-this-admin-password"))
L=threading.RLock()
S={"token":None,"seen":0,"frame":None,"cam":False,"mic":False,"sv":True,"sa":True,"av":True,"aa":True}
A=deque(maxlen=50)
def admin(f):
 @wraps(f)
 def w(*a,**k):
  if not session.get("admin"): return jsonify(error="ログインが必要です"),401
  return f(*a,**k)
 return w
def sender(f):
 @wraps(f)
 def w(*a,**k):
  with L:
   if not S["token"] or not secrets.compare_digest(request.headers.get("X-Sender-Token",""),S["token"]): return jsonify(error="送信端末認証エラー"),403
   S["seen"]=time.time()
  return f(*a,**k)
 return w
@app.get("/")
def home(): return jsonify(pages=["/sender","/admin","/public"])
@app.get("/<page>")
def page(page):
 if page not in ("sender","admin","public"): return Response(status=404)
 return send_from_directory("static",page+".html")
@app.post("/api/admin/login")
def login():
 if not check_password_hash(ADMIN_HASH,(request.json or {}).get("password","")): return jsonify(error="パスワードが違います"),401
 session["admin"]=True; return jsonify(ok=True)
@app.get("/api/admin/me")
def me(): return jsonify(auth=bool(session.get("admin")))
@app.post("/api/admin/logout")
def logout(): session.clear(); return jsonify(ok=True)
@app.post("/api/sender/claim")
def claim():
 with L:
  if S["token"] and time.time()-S["seen"]<15: return jsonify(error="別の送信端末が接続中です"),409
  S["token"]=secrets.token_urlsafe(32); S["seen"]=time.time(); S["cam"]=S["mic"]=False; A.clear()
  return jsonify(token=S["token"])
@app.post("/api/sender/release")
@sender
def release():
 with L: S["token"]=None; S["cam"]=S["mic"]=False; S["frame"]=None; A.clear()
 return jsonify(ok=True)
@app.post("/api/sender/state")
@sender
def sender_state():
 d=request.json or {}
 with L:
  for k in ("cam","mic","sv","sa"):
   if k in d:S[k]=bool(d[k])
 return jsonify(ok=True)
@app.post("/api/sender/frame")
@sender
def frame():
 b=request.get_data()
 if len(b)>1500000:return Response(status=413)
 with L:S["frame"]=b;S["cam"]=True
 return jsonify(ok=True)
@app.post("/api/sender/audio")
@sender
def audio():
 b=request.get_data()
 if len(b)<1 or len(b)>100000:return Response(status=413)
 with L:
  if S["mic"]:A.append(b)
 return jsonify(ok=True)
@app.get("/api/admin/state")
@admin
def admin_state():
 with L:return jsonify(cam=S["cam"],mic=S["mic"],av=S["av"],aa=S["aa"],connected=bool(S["token"] and time.time()-S["seen"]<15),has_frame=bool(S["frame"]))
@app.post("/api/admin/settings")
@admin
def settings():
 d=request.json or {}
 with L:
  if "av" in d:S["av"]=bool(d["av"])
  if "aa" in d:S["aa"]=bool(d["aa"])
 return jsonify(ok=True)
def getframe():
 with L:b=S["frame"]
 return Response(b,mimetype="image/jpeg",headers={"Cache-Control":"no-store"}) if b else Response(status=204)
@app.get("/api/admin/frame")
@admin
def admin_frame():return getframe()
@app.get("/api/public/state")
def public_state():
 with L:return jsonify(video=bool(S["cam"] and S["sv"] and S["av"] and S["frame"]),audio=bool(S["mic"] and S["sa"] and S["aa"]))
@app.get("/api/public/frame")
def public_frame():
 with L:ok=S["cam"] and S["sv"] and S["av"] and S["frame"]
 return getframe() if ok else Response(status=404)
@app.get("/api/admin/audio")
@admin
def admin_audio():
 with L:b=A.popleft() if A else None
 return Response(b,mimetype="application/octet-stream") if b else Response(status=204)
@app.get("/api/public/audio")
def public_audio():
 with L:
  ok=S["mic"] and S["sa"] and S["aa"];b=A.popleft() if ok and A else None
 return Response(b,mimetype="application/octet-stream") if b else Response(status=204 if ok else 404)
if __name__=="__main__":app.run(host="0.0.0.0",port=int(os.environ.get("PORT",5000)),threaded=True)

# Camera Share

カメラ・音声共有サイト（Flask版）。

## ページ
- `/sender`：送信端末。カメラとマイクの送信開始・停止、publicへの公開ON/OFF。
- `/admin`：管理者ログイン後、送信映像を常時プレビュー。publicへの映像・音声公開を個別に設定。
- `/public`：公開許可された映像・音声だけを表示。

## 起動方法（Windows）
```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:ADMIN_PASSWORD="自分で決めた長いパスワード"
$env:FLASK_SECRET="十分に長いランダムな秘密文字列"
python server.py
```
PCで `http://127.0.0.1:5000/sender` を開きます。LAN内の他端末からはPCのLAN IPアドレスとポート5000を使います。

## 公開条件
publicに映像を出す条件：送信サイトのカメラ送信中 AND 送信側映像公開ON AND 管理側映像公開ON。
音声も同じく、送信中かつ送信側・管理側の音声公開が両方ONの場合だけ公開します。管理側プレビューはpublic公開設定に影響されません。

## 注意事項
- 同時送信端末は1台に制限します（送信接続のリース方式）。
- カメラ・マイク利用にはHTTPSまたはlocalhostが必要なブラウザがあります。LAN内スマホから使う場合はHTTPS環境を用意してください。
- GitHub PagesではPythonサーバーは動きません。Flaskを実行できるPCまたはホスティング環境が必要です。
- 現在の初期版はJPEGフレームをHTTP送信する簡易プレビューです。音声転送は実験的なPCMチャンク方式で、一般的な音声ストリーミングとしての互換性・低遅延・長時間安定性は未検証です。実運用前に改良と実機テストが必要です。
- `ADMIN_PASSWORD` と `FLASK_SECRET` を必ず独自の値に変更してください。既定の管理パスワードのままインターネット公開しないでください。
- 映像・音声の送信や公開は、映る人・聞こえる人の同意を得て行ってください。

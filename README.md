# Bass Machine

TB-303 スタイルのステップ入力感を、**フレットレスベース / ウッドベース**の音色で楽しむ iPhone 向け PWA。

- ピュア Vanilla JS / 依存なし
- Web Audio API で音を合成（外部サーバ不要）
- オフラインで起動可能（Service Worker + Manifest）
- iPhone Safari / ホーム画面追加 PWA で動作

---

## ファイル構成

```
tb-base-machine/
├── index.html              # シングルページ UI
├── styles.css              # 黒基調 / 琥珀アクセントのデザイン
├── manifest.webmanifest    # PWA マニフェスト
├── sw.js                   # Service Worker（オフラインキャッシュ）
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
└── js/
    ├── app.js              # 状態 / UI ワイヤリング
    ├── synth.js            # Fretless / Wood の Web Audio 音源
    ├── sequencer.js        # 先読みスケジューラ
    ├── presets.js          # プリセット / デモパターン
    └── storage.js          # localStorage 保存
```

## セットアップ手順

1. このディレクトリごとローカルに配置する。
2. HTTPS もしくは `http://localhost` で配信する（Service Worker と AudioContext の要件）。

### ローカルで動かす（最速）

Python があれば：

```bash
cd tb-base-machine
python3 -m http.server 8080
```

Node があれば：

```bash
npx serve -l 8080 .
# もしくは
npx http-server -p 8080 .
```

ブラウザで `http://localhost:8080/` を開く。

### iPhone 実機での確認

#### 方法 A: 同一 LAN のローカルサーバから開く

1. Mac/PC 上で上のサーバを起動（例：`python3 -m http.server 8080`）。
2. iPhone と同じ Wi-Fi に接続する。
3. Mac/PC の IP を確認（例：`192.168.1.10`）。
4. iPhone Safari で `http://192.168.1.10:8080/` を開く。
5. 画面中央の **TAP TO START** をタップ（最初のタップで AudioContext が開始）。

> Safari は HTTP でも Service Worker を一部登録しない場合があります。完全に PWA として試したい場合は HTTPS か `localhost` を使ってください。

#### 方法 B: GitHub Pages / Netlify / Vercel に静的配置

HTTPS 配信される URL を iPhone Safari で開くだけで動作します。

### ホーム画面追加（PWA として起動）

1. iPhone Safari で開く。
2. 共有ボタン → 「ホーム画面に追加」。
3. ホーム画面のアイコンから起動するとフルスクリーンの standalone モードで起動する。

---

## 動作確認手順

1. **TAP TO START** を一度タップする（AudioContext 開始）。
2. 下のデモチップ（Jazz Walk / Singing / Latin / Groove）を押すと、それぞれ音色とパターンがロードされる。
3. 右上の再生（▶）をタップするとループ再生が始まる。再生中のステップは琥珀色でハイライトされる。
4. 16 ステップの任意のパッドをタップ：
   - 消灯のとき → 点灯＋選択。
   - 選択中の点灯パッドを再タップ → 消灯。
5. 下部キーボードで音程を変更、ACC/SLI/±1 ボタンでアクセント・スライド・オクターブを設定。
6. TONE / DECAY / ATTACK / SLIDE / VIBRA / BODY の各スライダーで音色を調整。
7. BPM スライダーで再生中でもテンポ変更可能。
8. RANDOM でランダムパターン生成、SAVE → LOAD で localStorage 往復、EXPORT で JSON ダウンロード。
9. 画面を別タブに移すと自動停止する（バックグラウンド処理の暴走防止）。

### PWA として起動しているか確認

- iOS 14 以降：ホーム画面追加したアイコンから起動すると、ステータスバーのみ見える全画面表示になる。
- Chrome DevTools（デスクトップ検証）: `Application` パネル → `Manifest` / `Service Workers` を確認。

---

## 音色設計メモ

### Fretless
- `sine + triangle + 少量 sawtooth` を内部ミックス → ローパス → ロー・シェルフ補強 → 極薄 soft-saturation。
- 4.5 Hz のサイン LFO で detune を揺らし、指弾き風のビブラート。
- `linearRampToValueAtTime` で前ステップ周波数から現ステップへグライド。
- 柔らかい長めのアタック／中程度のディケイ、アクセントでカットオフが少し開く。

### Wood
- `sine + triangle` を胴体として、アタック時に帯域ノイズ（bandpass 500–1400 Hz）と、基音の短い共鳴（bandpass Q=6）を重ねて「打音感＋胴鳴り」を演出。
- LFO ビブラートは最小限（生楽器の揺らぎ程度）。
- ピーキングで 160–340 Hz を押し上げてふくよかに。短めの自然減衰。

## 避けた実装

- アシッド／レゾナンス主体の TB-303 的ローパス。
- 過度なサチュレーション／派手なサブベース。
- 複雑な画面遷移・モーダル。
- 重いフレームワーク・ビルドツール（素のブラウザで即動く）。

---

## 今後の拡張候補

- 1〜4 小節までバー拡張（`Sequencer.setBars(n)` で内部は対応済み、UI だけ追加）。
- MIDI 入力／出力（Web MIDI API）。
- パターンチェイン（A/B/C/D）。
- 音色プリセットのユーザ追加・編集。
- タップテンポ（画面端をタップして BPM 取得）。
- 軽い delay / reverb バス（すでに `masterComp` の前段に差し込める構造）。
- AudioWorklet 版の軽量オーバードライブ。
- Wake Lock API で画面スリープ抑止（オプション）。

## ライセンス

MIT 相当で自由に利用可能。

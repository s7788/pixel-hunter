# hunt-8bit 交接（給接手的 Claude）

這是一個 Claude Code mod（函式 hooks 外掛）。先讀 `README.md`，再讀本檔。它已通過 `tsc`、9 個測試與 `claude plugin validate`，並由原作者在 Claude Desktop 實機確認第一版可用。

## 如何載入

1. 解壓縮成資料夾（內含 `.claude-plugin/plugin.json`）。
2. 載入方式擇一：
   - `claude --plugin-dir <資料夾>`（終端機；存檔後會熱重載）。
   - Desktop／SDK：設環境變數 `CLAUDE_CODE_PLUGIN_DIRS=<資料夾>`，必要時加 `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`。
   - 先載入 `plugin-authoring` skill 再改 mod，它會說明型別檔與熱重載。
3. 驗證指令（在資料夾內）：`claude plugin validate .`、`claude plugin test .`、`npx -p typescript@5.6.3 tsc -p . --noEmit`。型別檔由引擎在第一次載入時寫到 `.claude-plugin/types/`，沒有載入過就不能跑 `tsc`。
4. 指令：`/hunt` 開 pane，`/hunt-demo` 手動開始／結束狩獵（除錯）。pane 在 Desktop 為 dock 於右側。

## 重新擷取素材需要什麼

`hooks/gen/*.ts` 已是產出，直接可用。要重擷取或加動作才需要：

- 參考包 `hunt_8bit_reference` 資料夾（不在本包內，請另外取得）。
- Python 3 與 Pillow：`PYTHONUTF8=1 python -I tools/extract_sprites.py <參考包資料夾>`。
- 設定在 `tools/extract_spec.json`；`--sheet out.png` 輸出擷取總覽圖，先看圖再相信結果。

## 已定案的決策（不要重新討論，除非使用者要求）

- 純 mod，不做 Godot；遊戲畫在右側 pane。
- 渲染：只能用 SVG（方塊／path）；內嵌 PNG 會被引擎濾掉。每 125ms 由計時器送出「當下那一格」，不要用 CSS 動畫做逐格（會閃）。單張 SVG 上限 131,072 字元，單一原始檔上限 1 MB（所以格子用 RLE 拆檔）。
- 美術：獵人與冰呪龍從參考板 1:1 擷取，只去背與平移對齊；冰呪龍必須與參考 100% 相同，不可重繪或改色。大劍板放大 1.25 倍對齊 01／02 板獵人身高。場景 128×72、16 色、3 倍顯示。
- 特效保留在角色影格內；命中只看資料裡的 `active` 姿勢，不從發光像素推定。分層是 v2。
- 狩獵：冰呪龍有隱藏血量，跨回合與跨 session 累積（`$.store`，全域一位獵人）；歸零播 V25 倒地討伐，下一回合再開新一場；獵人力竭播 C17 回營，魔物血量保留。目標時長 5 分鐘，血量由固定種子模擬自動校正。新狩獵在 S02／S04 輪替，一場中途不換景。
- 連動：主回合開始出營或續打；`answer` 完成時鏡像跑離再回營；中斷凍結並顯示「暫停」；子代理回合（`e.agentId` 有值）一律忽略。`working_elapsed` 只計主回合。
- 戰鬥：本機規則加權重的隨機狀態機，閃避 70%，約 1/3 場會力竭，所有數值在 `hooks/data.ts`。不要每次出招都呼叫語言模型。
- 版本界線：沿用 World／Iceborne 動作方向，不加入 Rise／Sunbreak 的招式（見參考包 `CLAUDE_HANDOFF.md`）。

## 檔案地圖

- `hooks/register.tsx`：所有 hooks（turn、計時器、指令、pane 繪製、`$.store` 存檔）。
- `hooks/engine.ts`：純函式狀態機（`step`、`beginTurn`、`endTurn`、`restore`、`viewOf`）與血量校正。
- `hooks/data.ts`：全部調校數值。
- `hooks/svg.ts`：格子轉 SVG、HUD、暫停遮罩、武器列。
- `hooks/sprites.ts`：讀 RLE 的 `hooks/gen/*.ts`。
- `types/index.d.ts`：`$.state` 契約與狀態機型別（必須自包含，不能 import）。
- `hooks/hunt.test.tsx`：測試（時長校正、連動、存檔、SVG 大小上限）。

## 待做（v2，依優先序）

1. 太刀（L 系列）與弓（B 系列）：從 `images/04_longsword.png`、`05_bow.png` 擷取；這兩張板的格子裡畫了冰呪龍當距離參考，擷取時要排除。武器列目前畫在 SVG 裡且只有大劍可選；要改成營地內可切換的原生 Button，戰鬥中停用，並用 `pending_weapon` 在回營時套用。
2. 特效分層（吐息、刀光、冰屑成為獨立資產）。
3. 補中間影格；其餘 75 組動作；V29 死亡；其他魔物；S01 的使用。

## 已知注意事項

- `session.start` 在熱重載後會再跑一次；world 狀態放在 `$.state`，重載不會遺失，模組內變數會重置。
- 測試裡 `mock.clock`、`mock.store`、`ui.open`、`session.start` 都要自己提供實作，否則 hook 會被略過。
- 這個資料夾原本不在任何 git repo；若要版控請另開新資料夾，不要放進別的專案 repo。

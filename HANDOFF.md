# hunt-8bit 交接（給接手的 Claude）

這是一個 Claude Code mod（函式 hooks 外掛）。先讀 `docs/DEVELOPMENT.md`（設計範圍與素材管線），再讀本檔；`README.md` 是給使用者的介紹。它已通過 `tsc`、43 個測試與 `claude plugin validate`。第一版由原作者在 Claude Desktop 實機確認可用；碰撞版（v0.2，見下方「碰撞機制」）與武器版（v0.4，見下方「武器」）的 Desktop 實機驗收尚未完成。

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
- 每個動作可用的選項：`blank`（板上座標的矩形，先塗成底色）、`keepLeftOf`（丟掉最左點在這個 x 右側的色塊，相對於裁切框）、`groundY`（從這條板上的列以下全部清掉，給 `cut_ground` 抓不到的虛線地面）、`minIsland`（小於這個像素數的色塊丟掉，預設 3）、`align`、`anchorFrame`。

## 已定案的決策（不要重新討論，除非使用者要求）

- 純 mod，不做 Godot；遊戲畫在右側 pane。
- 渲染：只能用 SVG（方塊／path）；內嵌 PNG 會被引擎濾掉。每 125ms 由計時器送出「當下那一格」，不要用 CSS 動畫做逐格（會閃）。單張 SVG 上限 131,072 字元，單一原始檔上限 1 MB（所以格子用 RLE 拆檔）。
- 美術：獵人與冰呪龍從參考板 1:1 擷取，只去背與平移對齊；冰呪龍必須與參考 100% 相同，不可重繪或改色。大劍板與太刀板放大 1.25 倍對齊 01／02 板獵人身高，弓板 1:1。場景 128×72、16 色、3 倍顯示。
- 特效保留在角色影格內；命中只看攻擊框在 `active` 姿勢時是否碰到受擊框，不從發光像素推定。分層是 v2。
- 狩獵：冰呪龍有隱藏血量，跨回合與跨 session 累積（`$.store`，全域一位獵人）；歸零播 V25 倒地討伐，下一回合再開新一場；獵人力竭播 C17 回營，魔物血量保留。目標時長 5 分鐘，血量由固定種子模擬自動校正。新狩獵在 S02／S04 輪替，一場中途不換景。
- 連動：主回合開始出營或續打；回合完成（`answer`）或被中斷都鏡像跑離再回營，沒有暫停（v0.5；熱重載前停在舊 `paused` 的，`session.start` 會轉成撤退）；子代理回合（`e.agentId` 有值）一律忽略。`working_elapsed` 只計主回合。
- 戰鬥：本機規則加權重的隨機狀態機，所有數值在 `hooks/data.ts`。不要每次出招都呼叫語言模型。
- 版本界線：沿用 World／Iceborne 動作方向，不加入 Rise／Sunbreak 的招式（見參考包 `CLAUDE_HANDOFF.md`）。

## 檔案地圖

- `hooks/register.tsx`：所有 hooks（turn、計時器、指令、pane 繪製、`$.store` 存檔）。
- `hooks/engine.ts`：純函式狀態機（`step`、`beginTurn`、`endTurn`、`restore`、`viewOf`）與血量校正。
- `hooks/data.ts`：全部調校數值，含 `WEAPONS`（各武器的待機姿勢、平常招式、硬直時的大招）。
- `hooks/svg.ts`：格子轉 SVG、HUD、左下角的「武器 ○○」文字。
- `hooks/sprites.ts`：讀 RLE 的 `hooks/gen/*.ts`。
- `types/index.d.ts`：`$.state` 契約與狀態機型別（必須自包含，不能 import）。
- `hooks/collision-data.ts`：手工量測的受擊框、攻擊框、走位用身體寬度（純 JSON 物件，工具可直接讀）。
- `hooks/collision.ts`：純幾何（座標換算、AABB、可達判斷、部位選擇）。
- `hooks/hunt.test.tsx`：測試（時長校正、連動、存檔、SVG 大小上限、營地的武器按鈕）。
- `hooks/collision.test.ts`、`hooks/combat.test.ts`：框資料、幾何、規格驗收案例、武器選擇，以及每把武器各 40 場的模擬統計。

## 碰撞機制（v0.2，依 `hunt-8bit-collision-spec-v1.0.md`）

與規格不同、經使用者確認的決定：

1. 不做掃掠（swept AABB）與 tick 內切片。每 125ms 用當下姿勢的框檢查一次重疊；邊線、角接觸也算。理由：打鬥時移動每格只有幾像素。
2. 受擊框每個動作一組；身體明顯變形的（C08、G05、V14、V23、V25、V26）逐姿勢。
3. 這次不做肩撞減傷與 G10 防禦（規格 C22～C24 跳過）。
4. 翻滾往後約 30 像素（面向後方），無敵仍是 F2～F3（250～1250ms）。
5. 只在預測攻擊會碰到時才擲翻滾（`dodgeRate`，v0.5 起 40%），一招只擲一次（`dodgeFor` 記錄）；出招中不能滾。獵人一有空（待機或跑步）就會看見正在蓄的招：抽中就算好時間翻滾，沒抽中就往後跑到打不到為止。打得到他的招還沒結束前，他不會開始揮劍（v0.3.1）。v0.5 起「打得到」改用他將會有的身體判斷（`threat(g, as)`）：後退時用停下來站著的身體，出招前用那一招的身體（揮刀時的框比待機寬，舊版會揮進尾刺裡）；會被打到就站著等那一下過去（`swing`）。修正後力竭率掉到 2～10%，所以閃避率從 70% 調到 40%。
6. 冰呪龍只從「碰得到的招」中抽，碰不到就走近或等待。
7. 同一 tick 雙方互打一起結算；同時歸零 = 討伐 +1 且力竭 +1，`lastOutcome = 'mutual_ko'`，只走討伐回營。

運作：

- `hunterDo`／`monsterDo` 開始有 `active` 的招式時建立 `attack`（id = `huntNo:source:nextAttackSerial`），換招即取消。每 tick `settle()` 先用處理前狀態找出所有接觸，再一起扣血、處理中斷／硬直／倒地。`attack.contacts` 保證同招對同目標只結算一次（存檔也保留）。
- 走位：獵人選招後若碰不到就用 C03 跑近（`runStep`），碰得到就出招。兩者身體以 `MOVE_BOUNDS` 加 `BODY_GAP` 保持距離。
- 存檔：`saveSchemaVersion = 2`，新增 `simTick`、`nextAttackSerial`、`attack`、`intent`、`lastOutcome`、`hits`（最多 30 筆）。舊存檔或熱重載前的舊 world 都經 `migrate()`：在途攻擊丟棄、回營、血量不變。
- `register.tsx` 用一條 promise 佇列（`serial`）依序處理 tick、turn.start、turn.complete、`/hunt-demo`，避免撤退後還有舊 tick 扣血。
- 除錯：pane 下方不再顯示狀態機、事件、命中列表等文字（`log` atom 仍會記錄，只是不畫）；測試改從存檔讀狀態（`hunt.test.tsx` 的 `memStore`）。「除錯 ▾」內只剩「碰撞框」開關（預設關，存在 `$.store`）。綠＝受擊框、紅＝有效攻擊框、灰虛線＝出招前的攻擊範圍、青十字＝腳底、青箭頭＝實際面向（獵人素材朝右、冰呪龍朝左）、白叉＝最近 8 tick 內的命中點（灰叉＝翻滾閃過）。命中點是攻擊框與受擊框重疊區的中心，存在 `hits[].x/y`。
- 調框：改 `hooks/collision-data.ts` 的數字。座標是未鏡像素材、以腳底錨點為原點（x 向右、y 向上為負）。`hit.pose` 必須等於 `data.ts` 的 `active`（有測試把關）。

40 場固定種子模擬（`combat.test.ts` 的 40 場測試會印出，以下為大劍、v0.5）：平均 5.40 分鐘；力竭率 22.5%；出招 3847、命中 3637；冰呪龍出招 1170、打中獵人 409、翻滾閃過 204；每 tick p95 < 1ms、最大 3ms。

未完成：Desktop 實機驗收；規格 C33（校正零命中）只有程式防呆、沒有測試。

## 營地休息（v0.3）

- 回合之間（沒在工作）獵人會走到營火旁（C02 步行）→ 跪著烤肉（C21 F1）→ 站起來吃肉（C21 F4）→ 再烤下一塊，一直循環。純裝飾：HP 照舊回營立刻補滿；回合一開始立刻起身出營，不等吃完。
- 素材：C02、C21 從參考板 1:1 擷取，放在獨立群組 `camp`（`hooks/gen/camp.ts`，自己的 20 色調色盤），所以舊的獵人影格一個像素都沒變。C21 的格子底部切到 878，去掉地面線。
- 營地場景 S03 改成 32 色（16 色時帳篷、營火的暖色會被量化成藍色）。
- 營火火焰（4 格閃動）、木柴、烤肉架與肉（由生到熟變色）由 `svg.ts` 的 `campProps()` 用小方塊畫，位置與時間在 `data.ts` 的 `CAMP`。這些是道具，不是重畫角色。

## 武器（v0.4）

- 太刀（L01 待機、L02 縱斬連段、L03 袈裟斬、L05 氣刃大迴旋斬）與弓（B01 待機、B04 通常射擊、B05 快速射擊、B06 剛射）放在各自的群組 `ls`、`bow`（`hooks/gen/ls.ts`、`bow.ts`，各自 20 色調色盤），所以大劍與營地的影格一個像素都沒變。L01 只取 F1、F2，因為 F4 的腳比較低，會讓前三格浮起來。
- 太刀板每格都畫了冰呪龍。排除方法：每格的右邊界設在冰呪龍最左側之前，刀光碰到牠的部分用 `blank` 塗掉，再加 `groundY`、`minIsland` 清掉虛線地面與碎片。被切到的刀光停在冰呪龍的輪廓前。弓板沒有魔物。
- 選擇（`chooseWeapon`）：`weaponChoice` 是營地的選擇，`weapon` 是手上的武器。按鈕在回合一結束（`phase` 不是 `hunting`）就出現，不等計時器把獵人跑回營地。選固定武器時，只要獵人不在外面（`leaving`／`arriving`／`fight`）就立刻換上；在外面時（UI 只在回合結束後出現，這時獵人已在回營路上，實際上不會發生）就等回營（`toCamp`）或下次出營（`takeWeapon`），也就是原本規劃的 `pending_weapon`。「隨機」只在開新一場時抽，續打同一場不換。回合進行中，pane 的按鈕換成文字。按鈕留在圖片下方：Svg 是不能點的葉節點，圖片裡原本畫的武器框會被當成按鈕去點，所以改成左下角的純文字。
- 按鈕：pane 的按鈕（武器、除錯、碰撞框）由 `ui.press` hook 依 key 處理，不靠 `onPress`。pane 每 tick 重畫，`onPress` 的 closure 只活在畫出它的那次繪製，點擊剛好落在重畫之後就會丟（實測要點 2～3 次）。`onPress` 留著，只是 Button 必填。
- 武器自己的動作：`WEAPONS[w].moves` 覆寫 `idle`／`run`／`walk`／`roll`，營地裡也套用（`hunterMove`）。C01／C02／C03／C08 都畫著大劍，所以太刀用 L01（只取 F1、F2，F3/F4 腳比較低）、弓用 B01 當待機、走路、跑步；閃避用 L06 的 F1、F2、F2、F4（不取 F3 的反擊斬）與 B07。這兩種閃避是面向冰呪龍往後滑（`dodgeFacesFoe`），不像大劍翻滾時轉身背對；無敵姿勢與時間跟翻滾相同。受擊、倒地（C15／C17）看不到武器，仍共用。
- 平衡：冰呪龍血量照舊用大劍校正。太刀與弓的傷害乘上 `damageScale(weapon)`：用同一個固定種子的模擬反覆跑 4 次求出，讓每 tick 的傷害等於大劍。不能只跑一次，因為傷害放大後冰呪龍更常硬直、倒地，打得更快。第一次拿到那把武器出營時校正，結果留在模組變數裡，熱重載後重算。
- 存檔：`saveSchemaVersion = 3`。schema 2 的存檔補上大劍後照原狀繼續（不回營）；更舊的照舊遷移回營。
- 40 場模擬（`combat.test.ts` 會印出，v0.5）：大劍 5.40 分鐘、力竭 22.5%；太刀 5.12 分鐘、25%；弓 5.89 分鐘、57.5%。這個統計對參數很敏感、雜訊約 ±15%，三把沒有個別調。

## v0.5 修正的既有 bug

- 討伐演出（`slain`，約 5.75 秒）期間回答又開始下一回合時，`slain` 結束會把 `isResting` 設回 true，獵人整個回合待在營地。改在擊倒的那一刻設 `isResting`。
- 讀回「出營途中、還沒開打」的存檔時，`restore` 把 `isFresh` 清掉，冰呪龍從舊的 x（可能在畫面外）直接出現。拿掉那行。
- `phase` 回營後永遠停在 `retreat`，HUD 一直顯示「撤退」。`advance` 在回到營地時改回 `camp`。
- 冰呪龍倒地或起身中又被打倒（重新播 V25）。倒地與起身中不再觸發倒地，計數留到下一擊。
- 出招前只用待機的身體判斷會不會被打到（見上方碰撞機制第 5 點）。

稽核另外列了幾項可能的問題，沒有修：
- 太刀、弓第一次出營時要跑傷害倍率的校正，單次約 0.6～1 秒，會讓動畫停頓一下；熱重載後會重算。
- 引擎若在 `session.start` 跑完前就送來 `turn.start` 或按鈕，`changeGame` 會用新遊戲覆蓋存檔（要看引擎會不會這樣並行）。
- 多個 session 同時開著時，共用的存檔是後寫的蓋掉先寫的（全域一位獵人的既有設計）。
- 獵人與冰呪龍同一 tick 被打倒、獵人力竭時，冰呪龍的硬直／倒地計數會超過門檻留到下一場，下一擊立刻硬直。
- SVG 最大組合離 131,072 字元只剩約 120 字；`hunt.test.tsx` 現在會窮舉所有場景與影格組合把關。

## 待做（v2，依優先序）

1. 特效分層（吐息、刀光、冰屑成為獨立資產）。
2. 太刀與弓的其他招式（L04、L06–L12、B02／B03、B07–B12）；補中間影格；其餘動作；V29 死亡；其他魔物；S01 的使用。
3. 太刀、弓的跑步是持武器步移，看起來像快步走（參考板沒有這兩把武器收刀奔跑的動作）。

## 已知注意事項

- `session.start` 在熱重載後會再跑一次；world 狀態放在 `$.state`，重載不會遺失，模組內變數會重置。
- 測試裡 `mock.clock`、`mock.store`、`ui.open`、`session.start` 都要自己提供實作，否則 hook 會被略過。
- repo 在 https://github.com/s7788/hunt-8bit；`.claude-plugin/marketplace.json` 讓它本身就是一個 marketplace（`/plugin install hunt-8bit --marketplace s7788/hunt-8bit`）。

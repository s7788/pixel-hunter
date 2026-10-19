# hunt-8bit 交接（給接手的 Claude）

這是一個 Claude Code mod（函式 hooks 外掛）。先讀 `README.md`，再讀本檔。它已通過 `tsc`、45 個測試與 `claude plugin validate`。第一版由原作者在 Claude Desktop 實機確認可用；碰撞版（v0.2，見下方「碰撞機制」）的 Desktop 實機驗收尚未完成。

## 如何載入

1. 解壓縮成資料夾（內含 `.claude-plugin/plugin.json`）。
2. 載入方式擇一：
   - `claude --plugin-dir <資料夾>`（終端機；存檔後會熱重載）。
   - Desktop／SDK：設環境變數 `CLAUDE_CODE_PLUGIN_DIRS=<資料夾>`，必要時加 `CLAUDE_CODE_PLUGIN_DIR_WATCH=1`。
   - 先載入 `plugin-authoring` skill 再改 mod，它會說明型別檔與熱重載。
3. 驗證指令（在資料夾內）：`claude plugin validate .`、`claude plugin test .`、`npx -p typescript@5.6.3 tsc -p . --noEmit`。型別檔由引擎在第一次載入時寫到 `.claude-plugin/types/`，沒有載入過就不能跑 `tsc`。
4. 指令：`/hunt` 開 pane，`/hunt-demo` 手動開始／結束狩獵（除錯）；`/hunt-demo <魔物 id>` 丟棄進行中的狩獵、立刻打一場指定魔物（`engine.debugHunt`）。pane 在 Desktop 為 dock 於右側。

## 重新擷取素材需要什麼

`hooks/gen/*.ts` 已是產出，直接可用。要重擷取或加動作才需要：

- 參考包 `hunt_8bit_reference` 資料夾（不在本包內，請另外取得）。
- Python 3 與 Pillow：`PYTHONUTF8=1 python -I tools/extract_sprites.py <參考包資料夾>`。
- 設定在 `tools/extract_spec.json`；`--sheet out.png` 輸出擷取總覽圖，先看圖再相信結果。

## 已定案的決策（不要重新討論，除非使用者要求）

- 純 mod，不做 Godot；遊戲畫在右側 pane。
- 渲染：只能用 SVG（方塊／path）；內嵌 PNG 會被引擎濾掉。每 125ms 由計時器送出「當下那一格」，不要用 CSS 動畫做逐格（會閃）。單張 SVG 上限 131,072 字元，單一原始檔上限 1 MB（所以格子用 RLE 拆檔）。
- 美術：獵人與冰呪龍從參考板 1:1 擷取，只去背與平移對齊；冰呪龍必須與參考 100% 相同，不可重繪或改色。大劍板放大 1.25 倍對齊 01／02 板獵人身高。場景 128×72、16 色、3 倍顯示。
- 特效保留在角色影格內；命中只看攻擊框在 `active` 姿勢時是否碰到受擊框，不從發光像素推定。分層是 v2。
- 狩獵：冰呪龍有隱藏血量，跨回合與跨 session 累積（`$.store`，全域一位獵人）；歸零播 V25 倒地討伐，下一回合再開新一場；獵人力竭播 C17 回營，魔物血量保留。目標時長 5 分鐘，血量由固定種子模擬自動校正。新狩獵在 S02／S04 輪替，一場中途不換景。（v0.4 起：每隻魔物有自己的目標時長與場景，見「魔物註冊與大凶豺龍」。）
- 連動：主回合開始出營或續打；`answer` 完成時鏡像跑離再回營；中斷凍結並顯示「暫停」；子代理回合（`e.agentId` 有值）一律忽略。`working_elapsed` 只計主回合。
- 戰鬥：本機規則加權重的隨機狀態機，所有數值在 `hooks/data.ts`。不要每次出招都呼叫語言模型。
- 版本界線：沿用 World／Iceborne 動作方向，不加入 Rise／Sunbreak 的招式（見參考包 `CLAUDE_HANDOFF.md`）。

## 檔案地圖

- `hooks/register.tsx`：所有 hooks（turn、計時器、指令、pane 繪製、`$.store` 存檔）。
- `hooks/engine.ts`：純函式狀態機（`step`、`beginTurn`、`endTurn`、`restore`、`viewOf`）與逐魔物血量校正。
- `hooks/monsters/`：魔物定義與註冊表（見下方「魔物註冊與大凶豺龍」）。
- `hooks/data.ts`：獵人與營地的調校數值（魔物數值在各自的定義檔）。
- `hooks/svg.ts`：格子轉 SVG、HUD、暫停遮罩、武器列。
- `hooks/sprites.ts`：讀 RLE 的 `hooks/gen/*.ts`。
- `types/index.d.ts`：`$.state` 契約與狀態機型別（必須自包含，不能 import）。
- `hooks/collision-data.ts`：手工量測的受擊框、攻擊框、走位用身體寬度（純 JSON 物件，工具可直接讀）。
- `hooks/collision.ts`：純幾何（座標換算、AABB、可達判斷、部位選擇）。
- `hooks/hunt.test.tsx`：測試（時長校正、連動、存檔、SVG 大小上限）。
- `hooks/collision.test.ts`、`hooks/combat.test.ts`：框資料、幾何、規格驗收案例與 40 場模擬統計。

## 碰撞機制（v0.2，依 `hunt-8bit-collision-spec-v1.0.md`）

與規格不同、經使用者確認的決定：

1. 不做掃掠（swept AABB）與 tick 內切片。每 125ms 用當下姿勢的框檢查一次重疊；邊線、角接觸也算。理由：打鬥時移動每格只有幾像素。
2. 受擊框每個動作一組；身體明顯變形的（C08、G05、V14、V23、V25、V26）逐姿勢。
3. 這次不做肩撞減傷與 G10 防禦（規格 C22～C24 跳過）。
4. 翻滾往後約 30 像素（面向後方），無敵仍是 F2～F3（250～1250ms）。
5. 只在預測攻擊會碰到時才擲 70% 翻滾，一招只擲一次（`dodgeFor` 記錄）；出招中不能滾。獵人一有空（待機或跑步）就會看見正在蓄的招：抽中就算好時間翻滾，沒抽中就往後跑到打不到為止。打得到他的招還沒結束前，他不會開始揮劍（v0.3.1，把力竭率從 58% 拉回 38%）。
6. 冰呪龍只從「碰得到的招」中抽，碰不到就走近或等待。
7. 同一 tick 雙方互打一起結算；同時歸零 = 討伐 +1 且力竭 +1，`lastOutcome = 'mutual_ko'`，只走討伐回營。

運作：

- `hunterDo`／`monsterDo` 開始有 `active` 的招式時建立 `attack`（id = `huntNo:source:nextAttackSerial`），換招即取消。每 tick `settle()` 先用處理前狀態找出所有接觸，再一起扣血、處理中斷／硬直／倒地。`attack.contacts` 保證同招對同目標只結算一次（存檔也保留）。
- 走位：獵人選招後若碰不到就用 C03 跑近（`runStep`），碰得到就出招。兩者身體以 `MOVE_BOUNDS` 加 `BODY_GAP` 保持距離。
- 存檔：`saveSchemaVersion = 2`，新增 `simTick`、`nextAttackSerial`、`attack`、`intent`、`lastOutcome`、`hits`（最多 30 筆）。舊存檔或熱重載前的舊 world 都經 `migrate()`：在途攻擊丟棄、回營、血量不變。
- `register.tsx` 用一條 promise 佇列（`serial`）依序處理 tick、turn.start、turn.complete、`/hunt-demo`，避免撤退後還有舊 tick 扣血。
- 除錯：「除錯 ▾」內的「碰撞框」開關（預設關，存在 `$.store`）。綠＝受擊框、紅＝有效攻擊框、灰虛線＝出招前的攻擊範圍、青十字＝腳底、青箭頭＝實際面向（獵人素材朝右、冰呪龍朝左）、白叉＝最近 8 tick 內的命中點（灰叉＝翻滾閃過）；面板列出最近命中。命中點是攻擊框與受擊框重疊區的中心，存在 `hits[].x/y`。
- 調框：改 `hooks/collision-data.ts` 的數字。座標是未鏡像素材、以腳底錨點為原點（x 向右、y 向上為負）。`hit.pose` 必須等於 `data.ts` 的 `active`（有測試把關）。

40 場固定種子模擬（`combat.test.ts` 的 40 場測試會印出）：平均 5.12 分鐘；力竭率 37.5%（舊版約 35%）；出招 3566、命中 3336；冰呪龍出招 1147、打中獵人 510、翻滾閃過 331；每 tick p95 < 1ms、最大 3ms。

未完成：Desktop 實機驗收；規格 C33（校正零命中）只有程式防呆、沒有測試。

## 營地休息（v0.3）

- 回合之間（沒在工作）獵人會走到營火旁（C02 步行）→ 跪著烤肉（C21 F1）→ 站起來吃肉（C21 F4）→ 再烤下一塊，一直循環。純裝飾：HP 照舊回營立刻補滿；回合一開始立刻起身出營，不等吃完。
- 素材：C02、C21 從參考板 1:1 擷取，放在獨立群組 `camp`（`hooks/gen/camp.ts`，自己的 20 色調色盤），所以舊的獵人影格一個像素都沒變。C21 的格子底部切到 878，去掉地面線。
- 營地場景 S03 改成 32 色（16 色時帳篷、營火的暖色會被量化成藍色）。
- 營火火焰（4 格閃動）、木柴、烤肉架與肉（由生到熟變色）由 `svg.ts` 的 `campProps()` 用小方塊畫，位置與時間在 `data.ts` 的 `CAMP`。這些是道具，不是重畫角色。

## 魔物註冊與大凶豺龍（v0.4）

依參考包 `hunt-8bit-all-monsters-reference-v1.1` 的 `specs/hunt-8bit-monster-expansion-spec-v1.0.md`（第 2、3、4.1、6、7 節）。

- 結構：`hooks/monsters/types.ts`（`MonsterDef`、`MonsterMove`、`Mechanic`）、`registry.ts`（`MONSTERS`、`enabledMonsters`）、`velkhana.ts`、`great_jagras.ts`。引擎只讀選定的定義；專屬規則寫在 `mechanic`（`decide`／`damaged`／`idleMove` 等），引擎把 `act`／`say` 借給它，避免互相 import。
- 冰呪龍回歸：搬進註冊表後，40 場模擬與搬移前逐項相同（平均 5.12 分、力竭率 37.5%、出招 3566、命中 3336、冰呪龍出招 1147、打中 510、閃過 331、翻滾 384）。
- 存檔 `saveSchemaVersion = 3`：`hunt` 新增 `monsterId`、`definitionVersion`、`state`、`stateT`、`parts`、`cooldowns`。schema 2 存檔補欄位為冰呪龍、HP 與進行中的戰鬥保留；schema 1 照舊回營。找不到定義的魔物：留在營地、任務資料不動，標籤顯示「魔物資料未就緒」。
- 選怪：`drawMonster` 用種子與 `huntNo` 雜湊挑已啟用的魔物，不消耗戰鬥亂數。場景用該魔物的 `scenes` 依 `huntNo` 輪替。測試與校正用 `beginTurn(g, monsterId)` 指定魔物。
- 招式時間：規格的 `[start,end)`／總長對到四個關鍵姿勢，有效姿勢就是有效窗（例：JG01 `[6,8)`／16 → `[3,3,2,8]`、active 2）。`advance`：有效段內根位移（碰到獵人身體就停）。`travel`：拋射物每 tick 前進的像素，攻擊框隨之移動，到有效窗結束消失；魔物被打斷時一併取消（規格 3.3 第一版行為）。
- 選招：有 `range` 的招用軀幹間距的近／中／遠帶（0–32／32–96／96–160），沒有的（冰呪龍）照舊用「框碰得到」。`state` 限定狀態，`cooldown` 從出招當下記為「開始 + 動作長度 + 冷卻」。`approachWeight` 讓大凶豺龍在可出招時也可能走近。
- 反應優先序：死亡 > 專屬破壞（腹部）> 倒地 > 硬直；倒地中（`opening` 且有 `then`）不再倒地或硬直，已滿的計量歸零（規格 4.9）。部位優先序 belly > head > body > tail。
- 大凶豺龍素材：`tools/extract_spec.json` 的 `jagras` 群組，三張圖 12 組動作（IDLE、WALK、JG01–04、INFLATE、DEFLATE、FLINCH、TOPPLE、GETUP、DEATH），0.6 倍面積平均縮放、16 色、去背後剝掉兩圈背景暈邊（`dehalo`）、只留主體（`keepMain`，去掉胃液、塵土、動作線）。輸出 `hooks/gen/jagras.ts`（約 273 KB）。IDLE 可見約 143×76，符合規格的 140×64 比例目標。
- 間距：`bounds` 是推擠框（獵人身體不會進入），`torso` 是規格 3.3 判斷近／中／遠距用的軀幹寬（未設則用 `bounds`）。大凶豺龍頭部低，推擠框伸到下巴（`[-58, 46]`），膨腹時伸到腹部前緣（`mechanic.bounds` → `[-64, 46]`）；魔物前衝或變大時，獵人每 tick 被推回推擠框外。冰呪龍兩者相同，行為不變。
- 大凶豺龍框：`collision-data.ts` 的 `JG_*`，以規格 3.4 灰盒值為起點，在 10px 格線上逐姿勢對齊擷取後的影格；`belly` 只出現在畫成膨腹的姿勢。
- 模擬（20 個種子，`jagras.test.ts` 會印出）：校正 HP 967；中位 1.88 分（1.58–2.29）；力竭 0%；20 場共膨腹 43 次、腹部破壞 4 次；打中獵人：胃液 19、重壓 9、前咬 9、翻壓 1；每 tick p95 < 1ms。最大 SVG 約 86k 字元。

需要你確認的解讀與已知差異：

1. 規格「正常只選前咬與胃液團，膨腹才開放另外兩招」解讀為：膨腹時只出重壓與翻壓（前咬、胃液團的參考圖是正常體型，混用會穿幫）。
2. 一般硬直／倒地沿用 70／200（規格要求先沿用）。大凶豺龍 HP 較低，20 場出現 144 次硬直、80 次倒地，偏多；正式平衡時再調。
3. 膨腹中被一般硬直／倒地時，畫面用正常體型的 FLINCH／TOPPLE（參考包沒有膨腹版本）。
4. 沿用 v0.2 的決定：不做掃掠 AABB；同招對同目標只結算一次（單一 group）。多 group 連段（轟龍、雷狼龍、迅龍怒後）要在後續魔物時擴充。
5. ROAR、RUN、TURN、ENRAGE、EXHAUST、RETREAT 這次沒有擷取（大凶豺龍目前不觸發）。

## 待做（v2，依優先序）

1. 太刀（L 系列）與弓（B 系列）：從 `images/04_longsword.png`、`05_bow.png` 擷取；這兩張板的格子裡畫了冰呪龍當距離參考，擷取時要排除。武器列目前畫在 SVG 裡且只有大劍可選；要改成營地內可切換的原生 Button，戰鬥中停用，並用 `pending_weapon` 在回營時套用。
2. 特效分層（吐息、刀光、冰屑成為獨立資產）。
3. 補中間影格；其餘 75 組動作；V29 死亡。
4. 其餘新增魔物，依規格順序：飛雷龍 → 蠻顎龍 → 冰牙龍 → 迅龍 → 轟龍 → 雷狼龍 → 殲世滅盡龍（需先擴充多 group 攻擊、固定地面危險區、怒氣，並製作 S05 場景）。

## 已知注意事項

- `session.start` 在熱重載後會再跑一次；world 狀態放在 `$.state`，重載不會遺失，模組內變數會重置。
- 測試裡 `mock.clock`、`mock.store`、`ui.open`、`session.start` 都要自己提供實作，否則 hook 會被略過。
- 這個資料夾原本不在任何 git repo；若要版控請另開新資料夾，不要放進別的專案 repo。

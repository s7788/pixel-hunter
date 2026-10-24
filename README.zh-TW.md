# hunt-8bit

**Claude 在工作，你的 8-bit 獵人在狩獵。**

Claude Code 的側邊 pane。你送出提示，獵人就出營去打冰呪龍；Claude 回答完，獵人跑回營地烤肉，等你下一個提示。一場狩獵大約是 Claude 工作五分鐘的時間；沒打完的魔物會跨回合、跨 session 等你。

![獵人在營地烤肉，接著分別拿大劍、太刀、弓狩獵冰呪龍](docs/media/demo.zh-TW.gif)

[English](README.md)

## 安裝

在 Claude Code 終端機 session 的提示列輸入：

```
/plugin install hunt-8bit --marketplace s7788/hunt-8bit
```

按 `y` 新增 marketplace，再選安裝範圍，裝好立刻生效。

從 shell：

```bash
claude plugin install hunt-8bit --marketplace s7788/hunt-8bit
```

桌面版 app：點提示框旁的 **+** → **Plugins** → **Add marketplace**，填 `s7788/hunt-8bit`，再 **Add plugin**。

需要 Claude Code 2.1.275 以上（在桌面版 2.1.304 實測）。能顯示 pane 圖片的地方都會畫出像素畫面：桌面版、VS Code 與手機；終端機目前沒有 pane 畫面，只顯示一行文字。

遊戲文字跟著 Claude 的語言：Claude 用繁體中文就顯示中文，其他語言（包括簡體中文）一律顯示英文。先看 Claude 的 `language` 設定，沒設再看系統地區。

## 玩法

- **你的回合就是狩獵。** 送出提示，獵人出營；Claude 回答完或你中斷它，獵人回營。只看主回合，子代理不算。
- **戰鬥自動進行。** 獵人會看冰呪龍的招式：打得到他的就閃、往後退，跑近之後確定打得到才揮刀。冰呪龍也只用碰得到的招。
- **碰到才算傷害。** 每一招都有攻擊框，碰到對方身體才扣血。打開「除錯 ▸ → 碰撞框」就能看到。
- **進度會保留。** 冰呪龍的血量跨回合、跨 session 累積，打倒就是討伐；獵人血量歸零會力竭回營，冰呪龍的傷保留。
- **在營地選武器。** 回合之間，圖片下方有「大劍／太刀／弓／隨機」按鈕；隨機在每開一場新狩獵時抽一把。每把武器有自己的姿勢、跑步、閃避與招式，狩獵速度調成差不多。

| | 招式 | 特色 |
|---|---|---|
| 大劍 | 蓄力斬、肩撞；硬直或倒地時真蓄力斬 | 慢而重 |
| 太刀 | 縱斬連段、袈裟斬；硬直或倒地時氣刃大迴旋斬 | 出手快，往後滑步閃避 |
| 弓 | 通常射擊、快速射擊；硬直或倒地時剛射 | 能從遠處出手 |

![弓](docs/media/bow.zh-TW.png)

## 指令

- `/hunt`：開啟 pane（session 開始時也會自己打開）。
- `/hunt-demo`：不經 Claude 回合，手動開始或結束一場狩獵，試玩用。

## 你可能想知道

- **不用 token、不連網。** 戰鬥是本機的小狀態機，一秒走 8 步；不呼叫任何模型、不讀你的檔案、不往外送資料。
- **很輕。** 每一步遠低於 1 毫秒。
- **全域只有一位獵人。** 存檔在 plugin 自己的 store，所有 session 共用同一位獵人、同一隻受傷的冰呪龍。

## 同人專案

hunt-8bit 是非官方的同人專案，靈感來自魔物獵人系列，與 Capcom 無關，也未經其認可。像素圖是本專案自己的 8-bit 改編，不是從任何遊戲取出的素材。

## 參與開發

架構、素材管線與已知限制見 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)；設計決策與檔案地圖見 [HANDOFF.md](HANDOFF.md)。檢查指令：

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

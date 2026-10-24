# hunt-8bit

**An 8-bit hunter that fights while Claude works.**

A side pane for Claude Code. When you send Claude a prompt, your hunter leaves camp and fights an ice dragon. When Claude answers, the hunter runs back to camp and roasts meat until your next prompt. One hunt takes about five minutes of Claude's working time, and a wounded monster waits for you across turns and sessions.

![The hunter roasts meat at camp, then fights the ice dragon with the great sword, the long sword and the bow](docs/media/demo.gif)

[繁體中文](README.zh-TW.md)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install hunt-8bit --marketplace s7788/hunt-8bit
```

Answer `y` to add the marketplace, then pick a scope. The plugin is active right away.

From a shell:

```bash
claude plugin install hunt-8bit --marketplace s7788/hunt-8bit
```

In the desktop app, click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `s7788/hunt-8bit`, then **Add plugin**.

Needs Claude Code 2.1.275 or later (tested on 2.1.304 in the desktop app). The picture draws wherever a pane can show one: the desktop app, VS Code and mobile. The terminal has no pane picture yet; there the pane shows a line of text. The in-game text is in Chinese.

## How it plays

- **Your turn is the hunt.** A prompt sends the hunter out; Claude's answer, or you interrupting it, brings the hunter home. Subagents don't count, only the main turn.
- **The fight runs itself.** The hunter reads the monster's moves: it dodges what would hit it, backs off, runs in, and only swings when the blow would land. The monster only uses attacks that can reach.
- **Damage is real contact.** Every attack has hit boxes; a blow counts only when they touch the target's body. Open **除錯 ▸** (debug) and turn on **碰撞框** (collision boxes) to watch it.
- **Progress is kept.** The monster's HP carries over between turns and sessions. Bring it down for a kill; run out of HP and the hunter is carted back to camp, with the monster still wounded.
- **Pick your weapon at camp.** Under the picture, between turns: **大劍** (great sword), **太刀** (long sword), **弓** (bow) or **隨機** (random, a new draw for each new hunt). Each weapon has its own stance, run, dodge and moves, and they're balanced to hunt at about the same pace.

| | Moves | Character |
|---|---|---|
| Great sword | Charged slash, shoulder tackle; true charged slash on an opening | Slow, heavy blows |
| Long sword | Vertical combo, fade slash; spirit roundslash on an opening | Quick cuts, slides back to dodge |
| Bow | Normal shot, quick shot; power shot on an opening | Hits from range |

![Bow](docs/media/bow.png)

## Commands

- `/hunt` opens the pane (it also opens by itself when a session starts).
- `/hunt-demo` starts or ends a hunt without a Claude turn, to try it out.

## Good to know

- **No tokens, no network.** The fight is a small local state machine stepped 8 times a second. It never calls a model, never reads your files and never sends anything anywhere.
- **Light.** A tick takes well under a millisecond.
- **One hunter.** The save lives in the plugin's own store, so every session shares the same hunter and the same wounded monster.

## Fan project

hunt-8bit is an unofficial fan project, inspired by Monster Hunter. It is not affiliated with or endorsed by Capcom. The pixel art is this project's own 8-bit adaptation, not assets taken from any game.

## Contributing

How it's built, the sprite pipeline and the known limits: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). Design decisions and the file map: [HANDOFF.md](HANDOFF.md). Checks:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

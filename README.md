# pixel-hunter

**An 8-bit hunter that fights while Claude works.**

A side pane for Claude Code. When you send Claude a prompt, your hunter leaves camp and hunts one of nine monsters. When Claude answers, the hunter runs back to camp and roasts meat until your next prompt. A hunt takes two to seven minutes of Claude's working time, depending on the monster, and a wounded monster waits for you across turns and sessions.

![The hunter roasts meat at camp, then fights Tigrex with the great sword, Zinogre with the long sword and Velkhana with the bow](docs/media/demo.gif)

[繁體中文](README.zh-TW.md)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install hunt-8bit --marketplace s7788/pixel-hunter
```

Answer `y` to add the marketplace, then pick a scope. The plugin is active right away.

From a shell:

```bash
claude plugin install hunt-8bit --marketplace s7788/pixel-hunter
```

In the desktop app, click **+** next to the prompt box, then **Plugins** → **Add marketplace** with `s7788/pixel-hunter`, then **Add plugin**.

Needs Claude Code 2.1.275 or later (tested on 2.1.304 in the desktop app). The desktop app, VS Code and mobile draw the pixel art. The terminal draws it in character cells, or as an image in terminals that show images (kitty, Ghostty, iTerm2, WezTerm, foot); a button in the pane switches between the two.

The game speaks your language: Traditional Chinese where Claude does, English everywhere else. It follows Claude's `language` setting, then your locale.

## How it plays

- **Your turn is the hunt.** A prompt sends the hunter out; Claude's answer, or you interrupting it, brings the hunter home. Subagents don't count, only the main turn.
- **A new monster each hunt.** Every new hunt draws one of nine, each on its own hunting ground with its own moves and tricks: Great Jagras swells its belly, Tobi-Kadachi charges up, Anjanath readies fire, Barioth loses its wings, Nargacuga and Tigrex rage, Zinogre supercharges, Ruiner Nergigante grows spikes.
- **The fight runs itself.** The hunter reads the monster's moves: it dodges what would hit it, backs off, runs in, and only swings when the blow would land.
- **Damage is real contact.** Every attack has hit boxes; a blow counts only when they touch the target's body.
- **Progress is kept.** The monster's HP carries over between turns and sessions. Bring it down for a kill; run out of HP and the hunter is carted back to camp, with the monster still wounded. A strip under the picture counts your kills by monster.
- **Pick your weapon at camp.** Under the picture, between turns: **Great Sword**, **Long Sword**, **Bow** or **Random** (a different weapon at once, and again for each new hunt). Each weapon has its own stance, run, dodge and moves, and they're balanced to hunt every monster at about the same pace.

| | Moves | Character |
|---|---|---|
| Great sword | Charged slash, shoulder tackle; true charged slash on an opening | Slow, heavy blows |
| Long sword | Vertical combo, fade slash; spirit roundslash on an opening | Quick cuts, slides back to dodge |
| Bow | Normal shot, quick shot; power shot on an opening | Hits from range |

| Monster | Ground | Minutes |
|---|---|---|
| Great Jagras | Forest | 2 |
| Tobi-Kadachi | Forest | 3 |
| Anjanath | Forest | 4 |
| Velkhana | Snowfield, ice cave | 5 |
| Barioth | Snowfield | 5 |
| Nargacuga | Forest | 5 |
| Tigrex | Snowfield | 5 |
| Zinogre | Forest | 6 |
| Ruiner Nergigante | Crystal ruins | 7 |

![Bow](docs/media/bow.png)

## Commands

- `/hunt` opens the pane (it also opens by itself when a session starts).
- `/hunt-demo` starts or ends a hunt without a Claude turn, to try it out.
- `/hunt-demo <monster>` drops the hunt under way and heads out after that monster, for example `/hunt-demo zinogre`.

## Good to know

- **No tokens, no network.** The fight is a small local state machine stepped 8 times a second. It never calls a model, never reads your files and never sends anything anywhere.
- **Light.** A tick takes well under a millisecond. The first time a weapon meets a monster, the game spends about a second working out its damage scale.
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

# polar-signals.nvim

A Neovim plugin that displays **inline profiling annotations** from
[Parca](https://parca.dev) or [Polar Signals Cloud](https://polarsignals.com)
directly in your editor — the same functionality as the VS Code extension,
ported to Neovim.

## Features

- Inline **virtual text** at the end of each profiled line showing cumulative
  and flat values with percentage of total.
- **Heat-map line highlights** (hot → warm → mild → cool) colour-coded by
  CPU/memory intensity.
- Supports both **Polar Signals Cloud** (OAuth PKCE) and **self-hosted Parca**
  (no auth).
- Interactive pickers for time range, profile type, and label matchers via
  `vim.ui.select` — works out-of-the-box and integrates with
  [telescope.nvim](https://github.com/nvim-telescope/telescope.nvim),
  [fzf-lua](https://github.com/ibhagwan/fzf-lua), etc.
- **Auto-fetch** when switching buffers (if a previous query exists).
- **Statusline component** for lualine/windline/manual `statusline`.
- Copy line or file profiling summary to clipboard for AI assistance.
- User-configurable **presets** for one-command profiling.

## Requirements

- Neovim >= 0.9
- Node.js >= 18 (for the gRPC helper)
- `python3` with `pyarrow` (optional, only needed if the Node.js helper returns
  Arrow IPC bytes instead of pre-parsed JSON)
- `openssl` CLI (used by the OAuth PKCE flow for SHA-256 hashing)
- `curl` (used by the OAuth token exchange)

## Installation

### lazy.nvim

```lua
{
  'polarsignals/polar-signals.nvim',
  config = function()
    require('polar-signals').setup({
      -- 'oss' for self-hosted Parca, 'cloud' for Polar Signals Cloud
      mode = 'oss',
      self_hosted_url = 'http://localhost:7070',
    })
  end,
}
```

### packer.nvim

```lua
use {
  'polarsignals/polar-signals.nvim',
  config = function()
    require('polar-signals').setup({})
  end,
}
```

### Manual

Clone the repo and add `neovim/` to your `runtimepath`, then install the Node
dependencies:

```bash
git clone https://github.com/polarsignals/vscode-extension /tmp/polar-signals
cd /tmp/polar-signals/neovim
npm install   # or: pnpm install / yarn install
```

Add to Neovim config:

```lua
vim.opt.runtimepath:append('/tmp/polar-signals/neovim')
require('polar-signals').setup({})
```

## Setup

### Self-hosted Parca (OSS)

```lua
require('polar-signals').setup({
  mode = 'oss',
  self_hosted_url = 'http://localhost:7070',
  default_time_range = '15m',
  profile_type = 'parca_agent:samples:count:cpu:nanoseconds:delta',
  query_labels = {comm = 'myservice'},
  auto_fetch = true,
})
```

### Polar Signals Cloud

```lua
require('polar-signals').setup({
  mode = 'cloud',
  cloud_url = 'https://api.polarsignals.com',
  -- oauth_token and project_id are stored on disk after sign-in;
  -- you don't need to set them manually.
})
```

Run `:PolarSignalsSignIn` to authenticate and `:PolarSignalsSetup` to pick a
project.

## Commands

| Command | Description |
|---------|-------------|
| `:PolarSignalsFetch` | Interactive fetch: pick time range → profile type → label matchers |
| `:PolarSignalsClear` | Remove all annotations from all buffers |
| `:PolarSignalsSetup` | Run the setup wizard (mode, URL, OAuth, project) |
| `:PolarSignalsSignIn` | Sign in to Polar Signals Cloud |
| `:PolarSignalsSignOut` | Sign out of Polar Signals Cloud |
| `:PolarSignalsSelectPreset` | Pick and apply a configured preset |
| `:PolarSignalsFetchPreset <name>` | Apply a named preset directly |
| `:PolarSignalsCopyLine` | Copy current-line profiling data to `+` register |
| `:PolarSignalsCopyFile` | Copy file profiling summary to `+` register |

## Keymaps

The plugin does not set any keymaps by default. Example:

```lua
vim.keymap.set('n', '<leader>pf', '<cmd>PolarSignalsFetch<cr>',       {desc = 'Fetch profile'})
vim.keymap.set('n', '<leader>pc', '<cmd>PolarSignalsClear<cr>',       {desc = 'Clear annotations'})
vim.keymap.set('n', '<leader>pp', '<cmd>PolarSignalsSelectPreset<cr>',{desc = 'Select preset'})
vim.keymap.set('n', '<leader>py', '<cmd>PolarSignalsCopyLine<cr>',    {desc = 'Copy line profile'})
```

## Statusline Integration

### lualine

```lua
require('lualine').setup({
  sections = {
    lualine_x = {
      function() return require('polar-signals').statusline_component() end,
    },
  },
})
```

### Manual statusline

```vim
set statusline+=%{luaeval("require('polar-signals').statusline_component()")}
```

### Example output

```
[PS: CPU 15m]          -- active profile
[PS: CPU 15m {comm=api}]  -- with label filter
[PS: loading…]         -- fetching in progress
[PS: —]                -- no profile loaded
```

## Configuration Reference

```lua
require('polar-signals').setup({
  -- Connection
  mode            = 'oss',                    -- 'oss' | 'cloud'
  cloud_url       = 'https://api.polarsignals.com',
  self_hosted_url = 'http://localhost:7070',

  -- Auth (cloud mode; normally set automatically after sign-in)
  oauth_token = nil,
  project_id  = nil,

  -- Query defaults
  default_time_range = '15m',
  profile_type       = 'parca_agent:samples:count:cpu:nanoseconds:delta',
  query_labels       = {},   -- e.g. {comm = 'myservice', namespace = 'prod'}

  -- Presets
  presets = {
    -- {name = 'on-cpu-api', profile_type = '...', time_range = '15m', label_matchers = {comm='api'}},
  },

  -- Behaviour
  auto_fetch = true,   -- auto-fetch on BufEnter if a previous query exists

  -- Node.js helper
  node_path   = 'node',   -- path to node binary
  script_path = nil,       -- auto-detected; override if needed
})
```

## Highlight Groups

Override these in your colorscheme or `init.lua` after `setup()`:

| Group | Default | Usage |
|-------|---------|-------|
| `PolarSignalsHot` | dark red bg | Lines with ≥70% intensity |
| `PolarSignalsWarm` | dark orange bg | Lines with 40–70% intensity |
| `PolarSignalsMild` | dark yellow bg | Lines with 10–40% intensity |
| `PolarSignalsCool` | dark blue bg | Lines with <10% intensity |
| `PolarSignalsVText` | grey italic | Virtual text colour |

```lua
vim.api.nvim_set_hl(0, 'PolarSignalsHot',   {bg = '#4a1010'})
vim.api.nvim_set_hl(0, 'PolarSignalsVText',  {fg = '#aaaaaa', italic = true})
```

## Architecture

```
polar-signals.nvim/
├── lua/polar-signals/
│   ├── init.lua        -- setup(), command registration, autocmds
│   ├── config.lua      -- configuration management
│   ├── api.lua         -- bridges Lua to the Node.js helper (JSON over jobstart)
│   ├── annotations.lua -- virtual text + line highlights via extmarks
│   ├── auth.lua        -- OAuth PKCE flow for Polar Signals Cloud
│   ├── commands.lua    -- fetch, clear, presets, copy, auto-fetch
│   ├── converters.lua  -- Arrow IPC / chunk → LineData[]
│   ├── state.lua       -- in-memory session cache
│   ├── status.lua      -- statusline component
│   └── ui.lua          -- vim.ui.select flows (time range, profile type, labels)
├── plugin/
│   └── polar-signals.lua   -- Neovim plugin guard
└── scripts/
    └── parca-client.js     -- Node.js gRPC/HTTP helper
```

### Data Flow

```
:PolarSignalsFetch
  → ui.configure_query()        time range → profile type → label matchers
  → commands.do_fetch()
  → api.query_source_report()   JSON over Node.js helper
  → parca-client.js             gRPC queryRange (SOURCE report)
  ← chunks (line data JSON)
  → converters.parse_source_chunks()
  → annotations.apply()         nvim_buf_set_extmark (virt_text + line_hl_group)
  → state.store()               in-memory cache
  → status.set_active()         statusline update
```

## License

Apache-2.0 — same as the VS Code extension.

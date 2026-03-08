--- polar-signals.nvim — Neovim plugin for inline profiling annotations
--- from Parca / Polar Signals Cloud.
---
--- Usage (lazy.nvim example):
---   {
---     'polarsignals/polar-signals.nvim',
---     config = function()
---       require('polar-signals').setup({
---         mode = 'oss',
---         self_hosted_url = 'http://localhost:7070',
---       })
---     end,
---   }

local M = {}

local _initialized = false

--- Setup the plugin.  Call this once from your Neovim config.
---@param opts table|nil  See config.lua for available options.
function M.setup(opts)
  if _initialized then return end
  _initialized = true

  -- Apply configuration
  require('polar-signals.config').setup(opts)

  -- Define highlight groups
  require('polar-signals.annotations').define_highlights()

  -- Re-define highlights after colorscheme changes
  vim.api.nvim_create_autocmd('ColorScheme', {
    group = vim.api.nvim_create_augroup('PolarSignalsHL', {clear = true}),
    callback = function()
      require('polar-signals.annotations').define_highlights()
    end,
  })

  -- Restore OAuth token from disk (cloud mode)
  local cfg = require('polar-signals.config').get()
  if cfg.mode == 'cloud' then
    require('polar-signals.auth').restore()
  end

  -- Auto-fetch on buffer enter
  vim.api.nvim_create_autocmd('BufEnter', {
    group = vim.api.nvim_create_augroup('PolarSignalsAutoFetch', {clear = true}),
    callback = function()
      require('polar-signals.commands').on_buf_enter()
    end,
  })

  -- Register user commands
  local cmds = require('polar-signals.commands')

  vim.api.nvim_create_user_command('PolarSignalsFetch', function()
    cmds.fetch_profile()
  end, {desc = 'Fetch profiling data for the current file'})

  vim.api.nvim_create_user_command('PolarSignalsClear', function()
    cmds.clear_annotations()
  end, {desc = 'Clear profiling annotations'})

  vim.api.nvim_create_user_command('PolarSignalsSetup', function()
    cmds.setup_mode()
  end, {desc = 'Run the Polar Signals setup wizard'})

  vim.api.nvim_create_user_command('PolarSignalsSignIn', function()
    cmds.sign_in()
  end, {desc = 'Sign in to Polar Signals Cloud'})

  vim.api.nvim_create_user_command('PolarSignalsSignOut', function()
    cmds.sign_out()
  end, {desc = 'Sign out of Polar Signals Cloud'})

  vim.api.nvim_create_user_command('PolarSignalsSelectPreset', function()
    cmds.select_preset()
  end, {desc = 'Select and apply a query preset'})

  vim.api.nvim_create_user_command('PolarSignalsFetchPreset', function(a)
    cmds.fetch_with_preset(a.args)
  end, {desc = 'Fetch using a named preset', nargs = 1})

  vim.api.nvim_create_user_command('PolarSignalsCopyLine', function()
    cmds.copy_line_for_ai()
  end, {desc = 'Copy current-line profiling data to clipboard'})

  vim.api.nvim_create_user_command('PolarSignalsCopyFile', function()
    cmds.copy_file_for_ai()
  end, {desc = 'Copy file profiling summary to clipboard'})

  -- Statusline helper (for manual statusline configs)
  -- Usage:  %{luaeval("require('polar-signals.status').component()")}
  --   or add require('polar-signals').statusline_component() to lualine/windline.
end

--- Return a statusline string component.  Suitable for use with lualine etc.
---@return string
function M.statusline_component()
  return require('polar-signals.status').component()
end

--- Convenience: return the status module directly.
function M.status()
  return require('polar-signals.status')
end

return M

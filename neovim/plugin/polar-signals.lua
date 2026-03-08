-- Neovim plugin loader for polar-signals.nvim.
-- This file is sourced automatically by Neovim's plugin loader.
-- It is intentionally minimal; actual setup is done by the user calling
-- require('polar-signals').setup({...}).

if vim.g.loaded_polar_signals then
  return
end
vim.g.loaded_polar_signals = true

-- Require Neovim >= 0.9
if vim.fn.has('nvim-0.9') == 0 then
  vim.notify('[Polar Signals] Neovim >= 0.9 is required', vim.log.levels.ERROR)
  return
end

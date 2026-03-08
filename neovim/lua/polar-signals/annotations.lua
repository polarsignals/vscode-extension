--- Annotations module: renders inline profiling data as Neovim virtual text
--- and line/range highlights using the extmarks API.

local M = {}

local NS = vim.api.nvim_create_namespace('polar_signals')

-- Highlight groups (defined in setup, but fall back gracefully).
local HL = {
  hot   = 'PolarSignalsHot',
  warm  = 'PolarSignalsWarm',
  mild  = 'PolarSignalsMild',
  cool  = 'PolarSignalsCool',
  vtext = 'PolarSignalsVText',
}

--- Define default highlight groups (can be overridden by colorscheme/user).
function M.define_highlights()
  local function def(name, opts)
    if vim.fn.hlexists(name) == 0 then
      vim.api.nvim_set_hl(0, name, opts)
    end
  end
  -- Background line highlights (heat map)
  def(HL.hot,   {bg = '#3d1010'})
  def(HL.warm,  {bg = '#3d2a00'})
  def(HL.mild,  {bg = '#2e2d00'})
  def(HL.cool,  {bg = '#0d1f2e'})
  -- Virtual text colour
  def(HL.vtext, {fg = '#888888', italic = true})
end

--- Map a 0-1 intensity to a heat highlight group name.
---@param intensity number
---@return string
local function heat_hl(intensity)
  if intensity >= 0.7 then return HL.hot
  elseif intensity >= 0.4 then return HL.warm
  elseif intensity >= 0.1 then return HL.mild
  else return HL.cool
  end
end

--- Format a raw value + unit into a human-readable string.
---@param value number
---@param unit string
---@return string
local function format_value(value, unit)
  if unit == 'nanoseconds' then
    if value >= 1e9 then return string.format('%.2fs', value / 1e9)
    elseif value >= 1e6 then return string.format('%.2fms', value / 1e6)
    elseif value >= 1e3 then return string.format('%.2fµs', value / 1e3)
    else return string.format('%dns', value)
    end
  elseif unit == 'bytes' then
    if value >= 1e12 then return string.format('%.2fTB', value / 1e12)
    elseif value >= 1e9 then return string.format('%.2fGB', value / 1e9)
    elseif value >= 1e6 then return string.format('%.2fMB', value / 1e6)
    elseif value >= 1e3 then return string.format('%.2fkB', value / 1e3)
    else return string.format('%dB', value)
    end
  elseif unit == 'count' then
    if value >= 1e9 then return string.format('%.2fG', value / 1e9)
    elseif value >= 1e6 then return string.format('%.2fM', value / 1e6)
    elseif value >= 1e3 then return string.format('%.2fk', value / 1e3)
    else return tostring(math.floor(value))
    end
  else
    return tostring(math.floor(value))
  end
end

--- Build virtual-text string for a line.
---@param cumulative number
---@param flat number
---@param unit string
---@param total number
---@return string
local function vtext_for_line(cumulative, flat, unit, total)
  local cum_str = format_value(cumulative, unit)
  local flat_str = format_value(flat, unit)
  local cum_pct = total > 0 and string.format('%.1f%%', cumulative / total * 100) or '?'
  local flat_pct = total > 0 and string.format('%.1f%%', flat / total * 100) or '?'
  return string.format('  Cum: %s (%s) | Flat: %s (%s)', cum_str, cum_pct, flat_str, flat_pct)
end

---@class LineData
---@field line_number number  1-based
---@field cumulative number
---@field flat number

--- Apply profiling annotations to a buffer.
---@param bufnr number
---@param line_data LineData[]
---@param unit string
---@param total number
function M.apply(bufnr, line_data, unit, total)
  M.clear(bufnr)
  if not vim.api.nvim_buf_is_valid(bufnr) then return end

  -- Find max cumulative value for intensity normalization
  local max_cum = 0
  for _, row in ipairs(line_data) do
    if row.cumulative > max_cum then max_cum = row.cumulative end
  end
  if max_cum == 0 then return end

  for _, row in ipairs(line_data) do
    local lnum = row.line_number - 1 -- nvim uses 0-based
    local intensity = row.cumulative / max_cum
    local hl = heat_hl(intensity)
    local text = vtext_for_line(row.cumulative, row.flat, unit, total)

    -- Background highlight for the whole line
    vim.api.nvim_buf_set_extmark(bufnr, NS, lnum, 0, {
      line_hl_group = hl,
      priority = 100,
    })

    -- Virtual text at end of line
    vim.api.nvim_buf_set_extmark(bufnr, NS, lnum, 0, {
      virt_text = {{text, HL.vtext}},
      virt_text_pos = 'eol',
      priority = 100,
    })
  end
end

--- Remove all annotations from a buffer.
---@param bufnr number
function M.clear(bufnr)
  if vim.api.nvim_buf_is_valid(bufnr) then
    vim.api.nvim_buf_clear_namespace(bufnr, NS, 0, -1)
  end
end

--- Remove annotations from all loaded buffers.
function M.clear_all()
  for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
    M.clear(bufnr)
  end
end

return M

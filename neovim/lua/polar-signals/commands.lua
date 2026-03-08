--- Commands module: implements all user-facing actions.

local config = require('polar-signals.config')
local api = require('polar-signals.api')
local annotations = require('polar-signals.annotations')
local state = require('polar-signals.state')
local status = require('polar-signals.status')
local ui = require('polar-signals.ui')
local converters = require('polar-signals.converters')

local M = {}

--- Build a PromQL-style query string from a profile type and label matchers.
---@param profile_type string
---@param label_matchers table<string,string>
---@return string
local function build_query(profile_type, label_matchers)
  local parts = {}
  for k, v in pairs(label_matchers or {}) do
    parts[#parts + 1] = k .. '="' .. v .. '"'
  end
  if #parts > 0 then
    return profile_type .. '{' .. table.concat(parts, ',') .. '}'
  end
  return profile_type
end

--- Return the absolute path of the file open in the current buffer.
---@return string|nil
local function current_file()
  local path = vim.api.nvim_buf_get_name(0)
  if path == '' then return nil end
  return path
end

--- Find the best matching filename from the result filenames for the current file.
---@param result_filenames string[]
---@param current string
---@return string|nil
local function best_match(result_filenames, current)
  if #result_filenames == 0 then return nil end
  if #result_filenames == 1 then return result_filenames[1] end

  local basename = vim.fn.fnamemodify(current, ':t')
  -- 1. Exact suffix match
  for _, fn in ipairs(result_filenames) do
    if current:sub(-#fn) == fn or fn:sub(-#current) == current then
      return fn
    end
  end
  -- 2. Basename match
  for _, fn in ipairs(result_filenames) do
    if vim.fn.fnamemodify(fn, ':t') == basename then
      return fn
    end
  end
  return nil
end

--- Core fetch logic shared by fetchProfile and fetchWithPreset.
---@param query_cfg table  {profile_type, time_range, label_matchers}
---@param cb fun(ok:boolean)|nil
local function do_fetch(query_cfg, cb)
  local filepath = current_file()
  if not filepath then
    vim.notify('[Polar Signals] No file open', vim.log.levels.WARN)
    if cb then cb(false) end
    return
  end

  local cfg = config.get()
  local query = build_query(query_cfg.profile_type, query_cfg.label_matchers)
  local filename = vim.fn.fnamemodify(filepath, ':t') -- just the basename for the API

  status.set_loading()

  api.query_source_report(query, query_cfg.time_range, filename, nil, nil, function(ok, data)
    vim.schedule(function()
      if not ok then
        status.set_idle()
        vim.notify('[Polar Signals] Query failed: ' .. tostring(data), vim.log.levels.ERROR)
        if cb then cb(false) end
        return
      end

      local result = converters.parse_source_chunks(data.chunks or {})

      if #result.line_data == 0 then
        status.set_idle()
        vim.notify('[Polar Signals] No profiling data found for this file', vim.log.levels.WARN)
        if cb then cb(false) end
        return
      end

      -- Match the current file against result filenames
      local match = best_match(result.filenames, filepath)

      local function apply_for_file(matched_filename)
        local filtered = matched_filename
          and converters.filter_by_filename(result.line_data, matched_filename)
          or result.line_data

        if #filtered == 0 then
          status.set_idle()
          vim.notify('[Polar Signals] No data for the selected file', vim.log.levels.WARN)
          if cb then cb(false) end
          return
        end

        local bufnr = vim.api.nvim_get_current_buf()
        annotations.apply(bufnr, filtered, result.unit, result.total)

        state.store(filepath, {
          line_data = filtered,
          unit = result.unit,
          total = result.total,
          query_config = query_cfg,
        })
        state.set_last_query(query_cfg)
        status.set_active(query_cfg, #filtered)

        vim.notify(string.format('[Polar Signals] Applied %d line annotations (%s, %s)',
          #filtered, query_cfg.profile_type:match('([^:]+)'), query_cfg.time_range),
          vim.log.levels.INFO)

        if cb then cb(true) end
      end

      if match then
        apply_for_file(match)
      elseif #result.filenames > 1 then
        -- Let user pick
        vim.ui.select(result.filenames, {prompt = 'Select file:'}, function(sel)
          if sel then apply_for_file(sel)
          else
            status.set_idle()
            if cb then cb(false) end
          end
        end)
      else
        apply_for_file(result.filenames[1])
      end
    end)
  end)
end

--- PolarSignalsFetch: interactive fetch with full query configuration.
function M.fetch_profile()
  ui.configure_query(function(query_cfg)
    if not query_cfg then return end
    do_fetch(query_cfg)
  end)
end

--- PolarSignalsFetchPreset: fetch using a named preset from config.
---@param preset_name string
function M.fetch_with_preset(preset_name)
  local cfg = config.get()
  local preset
  for _, p in ipairs(cfg.presets or {}) do
    if p.name == preset_name then
      preset = p
      break
    end
  end
  if not preset then
    vim.notify('[Polar Signals] Preset not found: ' .. preset_name, vim.log.levels.ERROR)
    return
  end
  do_fetch({
    profile_type = preset.profile_type or cfg.profile_type,
    time_range = preset.time_range or cfg.default_time_range,
    label_matchers = preset.label_matchers or {},
  })
end

--- PolarSignalsClear: remove all annotations.
function M.clear_annotations()
  annotations.clear_all()
  state.clear_all()
  status.set_idle()
  vim.notify('[Polar Signals] Annotations cleared', vim.log.levels.INFO)
end

--- PolarSignalsSetup: run the setup wizard.
function M.setup_mode()
  ui.setup_wizard(function(ok)
    if ok then
      vim.notify('[Polar Signals] Setup complete', vim.log.levels.INFO)
    end
  end)
end

--- PolarSignalsSignOut: sign out of Polar Signals Cloud.
function M.sign_out()
  local auth = require('polar-signals.auth')
  auth.sign_out()
  api.reconfigure()
end

--- PolarSignalsSignIn: initiate OAuth sign-in.
function M.sign_in()
  local auth = require('polar-signals.auth')
  auth.sign_in(function(ok, token)
    if ok then
      api.reconfigure()
    end
  end)
end

--- PolarSignalsSelectPreset: pick and apply a preset interactively.
function M.select_preset()
  local cfg = config.get()
  local presets = cfg.presets or {}
  if #presets == 0 then
    vim.notify('[Polar Signals] No presets configured', vim.log.levels.WARN)
    return
  end
  local names = vim.tbl_map(function(p) return p.name end, presets)
  vim.ui.select(names, {prompt = 'Select preset:'}, function(name)
    if name then M.fetch_with_preset(name) end
  end)
end

--- PolarSignalsCopyLine: copy profiling data for the current line to clipboard.
function M.copy_line_for_ai()
  local filepath = current_file()
  if not filepath then return end
  local cached = state.get(filepath)
  if not cached then
    vim.notify('[Polar Signals] No profiling data for this file', vim.log.levels.WARN)
    return
  end
  local lnum = vim.api.nvim_win_get_cursor(0)[1]
  local row
  for _, r in ipairs(cached.line_data) do
    if r.line_number == lnum then row = r; break end
  end
  if not row then
    vim.notify('[Polar Signals] No profiling data for line ' .. lnum, vim.log.levels.WARN)
    return
  end
  local text = string.format(
    'Line %d — cumulative: %s, flat: %s (unit: %s, total: %s)',
    lnum, tostring(row.cumulative), tostring(row.flat), cached.unit, tostring(cached.total)
  )
  vim.fn.setreg('+', text)
  vim.notify('[Polar Signals] Copied to clipboard: ' .. text, vim.log.levels.INFO)
end

--- PolarSignalsCopyFile: copy file profiling summary to clipboard.
function M.copy_file_for_ai()
  local filepath = current_file()
  if not filepath then return end
  local cached = state.get(filepath)
  if not cached then
    vim.notify('[Polar Signals] No profiling data for this file', vim.log.levels.WARN)
    return
  end
  local lines = {}
  lines[#lines + 1] = 'Profiling summary for: ' .. filepath
  lines[#lines + 1] = string.format('Unit: %s | Total: %s', cached.unit, tostring(cached.total))
  for _, r in ipairs(cached.line_data) do
    lines[#lines + 1] = string.format('  Line %d: cum=%s flat=%s',
      r.line_number, tostring(r.cumulative), tostring(r.flat))
  end
  local text = table.concat(lines, '\n')
  vim.fn.setreg('+', text)
  vim.notify('[Polar Signals] File summary copied to clipboard', vim.log.levels.INFO)
end

--- Auto-fetch handler: called when the active buffer changes.
function M.on_buf_enter()
  local filepath = current_file()
  if not filepath then return end

  -- Restore cached annotations
  local cached = state.get(filepath)
  if cached then
    local bufnr = vim.api.nvim_get_current_buf()
    annotations.apply(bufnr, cached.line_data, cached.unit, cached.total)
    status.set_active(cached.query_config, #cached.line_data)
    return
  end

  -- Auto-fetch if enabled
  local cfg = config.get()
  if not cfg.auto_fetch then return end
  local last = state.get_last_query()
  if not last then return end

  -- Debounce: delay 150 ms to avoid fetching on rapid tab switches
  vim.defer_fn(function()
    -- Check we're still in the same buffer
    if current_file() ~= filepath then return end
    do_fetch(last)
  end, 150)
end

return M

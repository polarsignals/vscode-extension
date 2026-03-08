--- Configuration module for polar-signals.nvim
--- Reads from vim.g.polar_signals_* and the opts passed to setup().

local M = {}

---@class PolarSignalsConfig
---@field mode 'cloud'|'oss'
---@field cloud_url string
---@field self_hosted_url string
---@field oauth_token string|nil
---@field project_id string|nil
---@field default_time_range string
---@field profile_type string
---@field query_labels table<string,string>
---@field presets table[]
---@field auto_fetch boolean
---@field node_path string  path to node binary
---@field script_path string  path to parca-client.js (auto-detected if nil)

---@type PolarSignalsConfig
local defaults = {
  mode = 'oss',
  cloud_url = 'https://api.polarsignals.com',
  self_hosted_url = 'http://localhost:7070',
  oauth_token = nil,
  project_id = nil,
  default_time_range = '15m',
  profile_type = 'parca_agent:samples:count:cpu:nanoseconds:delta',
  query_labels = {},
  presets = {},
  auto_fetch = true,
  node_path = 'node',
  script_path = nil,
}

---@type PolarSignalsConfig
local _config = vim.deepcopy(defaults)

--- Return the path to parca-client.js, auto-detected from this file's location.
local function default_script_path()
  local src = debug.getinfo(1, 'S').source:sub(2) -- strip leading '@'
  -- lua/polar-signals/config.lua -> ../../scripts/parca-client.js
  local dir = vim.fn.fnamemodify(src, ':h:h:h')
  return dir .. '/scripts/parca-client.js'
end

--- Merge user-supplied opts into the config.
---@param opts table|nil
function M.setup(opts)
  opts = opts or {}
  _config = vim.tbl_deep_extend('force', defaults, opts)
  if not _config.script_path then
    _config.script_path = default_script_path()
  end
end

--- Return effective API URL based on mode.
function M.api_url()
  if _config.mode == 'cloud' then
    return _config.cloud_url
  else
    return _config.self_hosted_url
  end
end

--- Return full config table (read-only copy).
---@return PolarSignalsConfig
function M.get()
  return _config
end

--- Persist a key into the config (used by auth / setup wizard).
---@param key string
---@param value any
function M.set(key, value)
  _config[key] = value
end

return M

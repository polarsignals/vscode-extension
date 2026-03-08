--- Session state: in-memory cache of per-file profiling data and last query config.

local M = {}

---@class CachedProfile
---@field line_data table[]
---@field unit string
---@field total number
---@field query_config table
---@field timestamp number

---@type table<string, CachedProfile>
local _cache = {}

---@type table|nil  Last query config (profile_type, time_range, label_matchers)
local _last_query = nil

--- Normalize a file path key (lowercase, forward slashes).
---@param path string
---@return string
local function normalize(path)
  return path:lower():gsub('\\', '/')
end

--- Store profiling data for a file.
---@param path string
---@param profile CachedProfile
function M.store(path, profile)
  _cache[normalize(path)] = vim.tbl_extend('force', profile, {timestamp = os.time()})
end

--- Retrieve cached profiling data for a file (nil if not cached).
---@param path string
---@return CachedProfile|nil
function M.get(path)
  return _cache[normalize(path)]
end

--- Remove cached profiling data for a file.
---@param path string
function M.remove(path)
  _cache[normalize(path)] = nil
end

--- Clear all cached profiles.
function M.clear_all()
  _cache = {}
end

--- Set the last used query configuration.
---@param cfg table  {profile_type, time_range, label_matchers}
function M.set_last_query(cfg)
  _last_query = cfg
end

--- Return the last used query configuration, or nil.
---@return table|nil
function M.get_last_query()
  return _last_query
end

return M

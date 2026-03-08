--- Status module: exposes a statusline component and tracks the current profile state.

local M = {}

---@class ProfileStatus
---@field state 'idle'|'loading'|'active'
---@field profile_type string|nil
---@field time_range string|nil
---@field label_matchers table|nil
---@field count number|nil

---@type ProfileStatus
local _status = {state = 'idle'}

local SHORT_NAMES = {
  cpu        = 'CPU',
  memory     = 'Mem',
  alloc      = 'Alloc',
  goroutine  = 'Goroutine',
  mutex      = 'Mutex',
  block      = 'Block',
  wallclock  = 'Off-CPU',
  cuda       = 'GPU',
}

--- Derive a short display name from a profile type string.
---@param pt string
---@return string
local function short_name(pt)
  local lower = pt:lower()
  for key, name in pairs(SHORT_NAMES) do
    if lower:find(key, 1, true) then return name end
  end
  -- Fall back to first 10 chars of the first segment
  return pt:match('([^:]+)'):sub(1, 10)
end

function M.set_idle()
  _status = {state = 'idle'}
end

function M.set_loading()
  _status = {state = 'loading'}
end

---@param query_config table
---@param count number
function M.set_active(query_config, count)
  _status = {
    state = 'active',
    profile_type = query_config.profile_type,
    time_range = query_config.time_range,
    label_matchers = query_config.label_matchers,
    count = count,
  }
end

--- Return the current profile status for use in statuslines.
--- Suitable for use directly in a `statusline` or lualine/windline component.
---@return string
function M.component()
  if _status.state == 'loading' then
    return '[PS: loading…]'
  elseif _status.state == 'active' then
    local name = short_name(_status.profile_type or '')
    local tr = _status.time_range or ''
    local label_str = ''
    if _status.label_matchers and next(_status.label_matchers) then
      local parts = {}
      for k, v in pairs(_status.label_matchers) do
        parts[#parts + 1] = k .. '=' .. v
      end
      label_str = ' {' .. table.concat(parts, ',') .. '}'
    end
    return string.format('[PS: %s %s%s]', name, tr, label_str)
  else
    return '[PS: —]'
  end
end

--- Return raw status table (for programmatic use).
---@return ProfileStatus
function M.get()
  return _status
end

return M

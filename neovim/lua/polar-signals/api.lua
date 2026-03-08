--- API module: bridges Lua to the Node.js parca-client.js helper.
--- All calls are asynchronous via vim.fn.jobstart(); callbacks receive (ok, data).

local config = require('polar-signals.config')
local M = {}

-- A single persistent job handle so we don't spawn a new process per call.
-- The job speaks a simple newline-delimited JSON protocol:
--   stdin:  { "id": N, "name": "cmd", "args": {...} }
--   stdout: { "id": N, "ok": true,  "data": {...} }
--        or { "id": N, "ok": false, "error": "..." }

local _job = nil
local _callbacks = {} -- id -> callback
local _id_seq = 0
local _buf = ''

local function next_id()
  _id_seq = _id_seq + 1
  return _id_seq
end

local function on_stdout(_, lines, _)
  for _, line in ipairs(lines) do
    _buf = _buf .. line
    -- Try to parse when we have a complete JSON object
    local ok, msg = pcall(vim.json.decode, _buf)
    if ok and type(msg) == 'table' then
      _buf = ''
      local id = msg.id
      local cb = _callbacks[id]
      if cb then
        _callbacks[id] = nil
        if msg.ok then
          cb(true, msg.data)
        else
          cb(false, msg.error or 'unknown error')
        end
      end
    end
  end
end

local function on_stderr(_, lines, _)
  for _, line in ipairs(lines) do
    if line ~= '' then
      vim.schedule(function()
        vim.notify('[Polar Signals] helper stderr: ' .. line, vim.log.levels.DEBUG)
      end)
    end
  end
end

local function on_exit(_, code, _)
  _job = nil
  if code ~= 0 then
    vim.schedule(function()
      vim.notify('[Polar Signals] helper process exited with code ' .. code, vim.log.levels.WARN)
    end)
  end
  -- Fail all pending callbacks
  for id, cb in pairs(_callbacks) do
    _callbacks[id] = nil
    cb(false, 'helper process exited')
  end
end

--- Ensure the Node.js helper is running, configure it, then call cb().
local function ensure_started(cb)
  if _job ~= nil then
    cb()
    return
  end

  local cfg = config.get()
  local cmd = {cfg.node_path, cfg.script_path}

  _job = vim.fn.jobstart(cmd, {
    on_stdout = on_stdout,
    on_stderr = on_stderr,
    on_exit = on_exit,
    stdout_buffered = false,
    stderr_buffered = false,
  })

  if _job <= 0 then
    _job = nil
    vim.notify('[Polar Signals] failed to start Node.js helper', vim.log.levels.ERROR)
    return
  end

  -- Send configuration
  local configure_msg = vim.json.encode({
    id = next_id(),
    name = 'configure',
    args = {
      mode = cfg.mode,
      apiUrl = M.api_url(),
      oauthToken = cfg.oauth_token,
      projectId = cfg.project_id,
    },
  })
  vim.fn.chansend(_job, configure_msg .. '\n')

  cb()
end

function M.api_url()
  return config.api_url()
end

--- Send a command to the helper and call cb(ok, data) when done.
---@param name string
---@param args table
---@param cb fun(ok:boolean, data:any)
function M.call(name, args, cb)
  ensure_started(function()
    if not _job then
      cb(false, 'helper not running')
      return
    end
    local id = next_id()
    _callbacks[id] = cb
    local msg = vim.json.encode({id = id, name = name, args = args or {}})
    vim.fn.chansend(_job, msg .. '\n')
  end)
end

--- Reconfigure the running helper after settings change.
function M.reconfigure()
  if not _job then return end
  local cfg = config.get()
  local msg = vim.json.encode({
    id = next_id(),
    name = 'configure',
    args = {
      mode = cfg.mode,
      apiUrl = M.api_url(),
      oauthToken = cfg.oauth_token,
      projectId = cfg.project_id,
    },
  })
  vim.fn.chansend(_job, msg .. '\n')
end

--- Stop the helper process (called on plugin unload).
function M.stop()
  if _job then
    vim.fn.jobstop(_job)
    _job = nil
  end
end

--- Fetch source-level profiling data for a file.
---@param query string  PromQL-style query
---@param time_range string  e.g. '15m'
---@param filename string
---@param build_id string|nil
---@param filters string|nil
---@param cb fun(ok:boolean, data:any)
function M.query_source_report(query, time_range, filename, build_id, filters, cb)
  M.call('querySourceReport', {
    query = query,
    timeRange = time_range,
    filename = filename,
    buildId = build_id or '',
    filters = filters or '',
  }, cb)
end

---@param time_range string
---@param cb fun(ok:boolean, types:string[])
function M.get_profile_types(time_range, cb)
  M.call('getProfileTypes', {timeRange = time_range}, function(ok, data)
    if ok then
      cb(true, data.types or {})
    else
      cb(false, data)
    end
  end)
end

---@param profile_type string
---@param time_range string
---@param cb fun(ok:boolean, labels:string[])
function M.get_labels(profile_type, time_range, cb)
  M.call('getLabels', {profileType = profile_type, timeRange = time_range}, function(ok, data)
    if ok then
      cb(true, data.labels or {})
    else
      cb(false, data)
    end
  end)
end

---@param profile_type string
---@param label_name string
---@param time_range string
---@param cb fun(ok:boolean, values:string[])
function M.get_values(profile_type, label_name, time_range, cb)
  M.call('getValues', {profileType = profile_type, labelName = label_name, timeRange = time_range}, function(ok, data)
    if ok then
      cb(true, data.values or {})
    else
      cb(false, data)
    end
  end)
end

---@param cb fun(ok:boolean, projects:table[])
function M.get_projects(cb)
  M.call('getProjects', {}, function(ok, data)
    if ok then
      cb(true, data.projects or {})
    else
      cb(false, data)
    end
  end)
end

return M

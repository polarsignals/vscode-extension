--- Interactive UI helpers: time range picker, profile type picker, label picker.
--- Uses vim.ui.select() so the user can override with telescope/fzf/etc.

local api = require('polar-signals.api')
local config = require('polar-signals.config')
local M = {}

local TIME_RANGES = {'5m', '15m', '1h', '24h', '7d', '30d'}

--- Well-known human-readable names for profile type strings.
local WELL_KNOWN = {
  ['parca_agent:samples:count:cpu:nanoseconds:delta']       = 'On-CPU (CPU samples)',
  ['parca_agent:wallclock:nanoseconds:samples:count:delta'] = 'Off-CPU (wall clock)',
  ['parca_agent:cuda:nanoseconds:cuda:nanoseconds:delta']   = 'On-GPU (CUDA)',
  ['process_cpu:cpu:nanoseconds:cpu:nanoseconds:delta']     = 'On-CPU (process)',
  ['memory:alloc_objects:count:space:bytes:delta']          = 'Memory (alloc objects)',
  ['memory:alloc_space:bytes:space:bytes:delta']            = 'Memory (alloc bytes)',
  ['memory:inuse_objects:count:space:bytes:']               = 'Memory (in-use objects)',
  ['memory:inuse_space:bytes:space:bytes:']                 = 'Memory (in-use bytes)',
  ['goroutine:goroutine:count:goroutine:count:']            = 'Goroutines',
  ['mutex:contentions:count:delay:nanoseconds:delta']       = 'Mutex contentions',
  ['block:contentions:count:delay:nanoseconds:delta']       = 'Block contentions',
}

local function display_name(pt)
  if WELL_KNOWN[pt] then
    return WELL_KNOWN[pt] .. '  [' .. pt .. ']'
  end
  return pt
end

--- Prompt the user to select a time range.
---@param cb fun(time_range:string|nil)
function M.select_time_range(cb)
  local cfg = config.get()
  vim.ui.select(TIME_RANGES, {
    prompt = 'Select time range:',
    format_item = function(item)
      return item .. (item == cfg.default_time_range and ' (default)' or '')
    end,
  }, function(choice)
    cb(choice)
  end)
end

--- Prompt the user to select a profile type.
---@param time_range string
---@param cb fun(profile_type:string|nil)
function M.select_profile_type(time_range, cb)
  local cfg = config.get()
  api.get_profile_types(time_range, function(ok, types)
    vim.schedule(function()
      if not ok or #types == 0 then
        -- Fallback: let user type it
        vim.ui.input({prompt = 'Profile type: ', default = cfg.profile_type}, cb)
        return
      end

      vim.ui.select(types, {
        prompt = 'Select profile type:',
        format_item = display_name,
      }, function(choice)
        cb(choice)
      end)
    end)
  end)
end

--- Prompt the user to add label matchers.
---@param profile_type string
---@param time_range string
---@param cb fun(labels:table<string,string>)
function M.select_labels(profile_type, time_range, cb)
  local matchers = {}

  local function ask_add_more()
    vim.ui.select({'Yes', 'No'}, {prompt = 'Add label filter?'}, function(choice)
      if choice ~= 'Yes' then
        cb(matchers)
        return
      end
      -- Fetch available labels
      api.get_labels(profile_type, time_range, function(ok, labels)
        vim.schedule(function()
          if not ok or #labels == 0 then
            cb(matchers)
            return
          end
          vim.ui.select(labels, {prompt = 'Select label:'}, function(label)
            if not label then cb(matchers); return end
            api.get_values(profile_type, label, time_range, function(ok2, values)
              vim.schedule(function()
                if not ok2 or #values == 0 then
                  vim.ui.input({prompt = label .. '='}, function(val)
                    if val and val ~= '' then matchers[label] = val end
                    ask_add_more()
                  end)
                else
                  vim.ui.select(values, {prompt = label .. '='}, function(val)
                    if val then matchers[label] = val end
                    ask_add_more()
                  end)
                end
              end)
            end)
          end)
        end)
      end)
    end)
  end

  ask_add_more()
end

--- Full interactive query configuration: time range → profile type → labels.
---@param cb fun(cfg:table|nil)  {time_range, profile_type, label_matchers}
function M.configure_query(cb)
  M.select_time_range(function(time_range)
    if not time_range then cb(nil); return end
    M.select_profile_type(time_range, function(profile_type)
      if not profile_type then cb(nil); return end
      M.select_labels(profile_type, time_range, function(label_matchers)
        cb({
          time_range = time_range,
          profile_type = profile_type,
          label_matchers = label_matchers,
        })
      end)
    end)
  end)
end

--- Run the setup wizard (mode selection → URL or OAuth).
---@param cb fun(ok:boolean)
function M.setup_wizard(cb)
  vim.ui.select({'Polar Signals Cloud', 'Self-hosted Parca'}, {prompt = 'Select mode:'}, function(choice)
    if not choice then cb(false); return end
    if choice == 'Polar Signals Cloud' then
      config.set('mode', 'cloud')
      local auth = require('polar-signals.auth')
      auth.sign_in(function(ok, token)
        if not ok then cb(false); return end
        -- Fetch and select project
        local api_mod = require('polar-signals.api')
        api_mod.reconfigure()
        api_mod.get_projects(function(ok2, projects)
          vim.schedule(function()
            if not ok2 or #projects == 0 then
              vim.notify('[Polar Signals] No projects found', vim.log.levels.WARN)
              cb(true)
              return
            end
            local items = vim.tbl_map(function(p)
              return p.org .. '/' .. p.name
            end, projects)
            vim.ui.select(items, {prompt = 'Select project:'}, function(sel)
              if not sel then cb(true); return end
              local idx = vim.fn.index(items, sel) + 1
              if idx > 0 and projects[idx] then
                config.set('project_id', projects[idx].id)
                api_mod.reconfigure()
              end
              cb(true)
            end)
          end)
        end)
      end)
    else
      config.set('mode', 'oss')
      vim.ui.input({
        prompt = 'Parca server URL: ',
        default = config.get().self_hosted_url,
      }, function(url)
        if url and url ~= '' then
          config.set('self_hosted_url', url)
          require('polar-signals.api').reconfigure()
        end
        cb(true)
      end)
    end
  end)
end

return M

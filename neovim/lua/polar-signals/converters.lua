--- Converters: decode the profiling data returned by the Node.js helper.
---
--- The helper returns Arrow IPC bytes encoded as base64. We shell out to a tiny
--- Python/Node script to decode the Arrow data and return JSON line data, since
--- Neovim Lua has no native Arrow reader.

local M = {}

--- Parse the chunks array returned by querySourceReport into line data.
--- The helper now returns line-level JSON directly (not Arrow bytes),
--- so this function simply extracts the relevant fields.
---
---@param chunks table[]  list of {type, ...} objects from the helper
---@return table  { line_data: LineData[], unit: string, total: number, filenames: string[] }
function M.parse_source_chunks(chunks)
  local line_data = {}
  local unit = 'count'
  local total = 0
  local filenames = {}
  local filenames_set = {}

  for _, chunk in ipairs(chunks) do
    if chunk.type == 'source' then
      unit = chunk.unit or 'count'
      total = tonumber(chunk.total) or 0
    elseif chunk.type == 'lines' then
      -- Direct line data (preferred: helper sends pre-parsed JSON)
      for _, row in ipairs(chunk.rows or {}) do
        line_data[#line_data + 1] = {
          filename = row.filename or '',
          line_number = tonumber(row.line_number) or 0,
          cumulative = tonumber(row.cumulative) or 0,
          flat = tonumber(row.flat) or 0,
        }
        if row.filename and not filenames_set[row.filename] then
          filenames_set[row.filename] = true
          filenames[#filenames + 1] = row.filename
        end
      end
    elseif chunk.type == 'arrow' then
      -- Arrow IPC bytes (base64). Decode via the arrow-decode helper script.
      -- This path is used when the helper cannot parse Arrow in-process.
      local decoded = M.decode_arrow_base64(chunk.data)
      if decoded then
        for _, row in ipairs(decoded) do
          line_data[#line_data + 1] = row
          if row.filename and not filenames_set[row.filename] then
            filenames_set[row.filename] = true
            filenames[#filenames + 1] = row.filename
          end
        end
      end
    end
  end

  return {line_data = line_data, unit = unit, total = total, filenames = filenames}
end

--- Decode Arrow IPC data (base64-encoded) by calling a tiny Python helper.
--- Returns a list of {filename, line_number, cumulative, flat} rows, or nil.
---@param b64 string
---@return table[]|nil
function M.decode_arrow_base64(b64)
  -- Write base64 data to a temp file, then call python3 to decode it.
  local tmpfile = os.tmpname()
  local f = io.open(tmpfile, 'w')
  if not f then return nil end
  f:write(b64)
  f:close()

  local script = [[
import sys, base64, json
try:
    import pyarrow as pa
    data = base64.b64decode(open(sys.argv[1]).read())
    reader = pa.ipc.open_stream(pa.BufferReader(data))
    rows = []
    for batch in reader:
        d = batch.to_pydict()
        for i in range(batch.num_rows):
            rows.append({
                'filename': str(d['filename'][i]) if 'filename' in d else '',
                'line_number': int(d['line_number'][i]) if 'line_number' in d else 0,
                'cumulative': int(d['cumulative'][i]) if 'cumulative' in d else 0,
                'flat': int(d['flat'][i]) if 'flat' in d else 0,
            })
    print(json.dumps(rows))
except ImportError:
    # pyarrow not available; fall back to empty result
    print('[]')
except Exception as e:
    sys.stderr.write(str(e))
    print('[]')
]]

  local out_lines = {}
  local job = vim.fn.jobstart({'python3', '-c', script, tmpfile}, {
    stdout_buffered = true,
    on_stdout = function(_, lines, _)
      for _, l in ipairs(lines) do
        if l ~= '' then out_lines[#out_lines + 1] = l end
      end
    end,
    on_exit = function(_, _, _)
      os.remove(tmpfile)
    end,
  })

  if job <= 0 then
    os.remove(tmpfile)
    return nil
  end

  -- Wait synchronously (we're inside a callback, this is acceptable)
  vim.fn.jobwait({job}, 10000)

  local json_str = table.concat(out_lines, '')
  if json_str == '' then return nil end
  local ok, rows = pcall(vim.json.decode, json_str)
  return ok and rows or nil
end

--- Filter line_data to only rows matching a given filename (exact or suffix).
---@param line_data table[]
---@param filename string
---@return table[]
function M.filter_by_filename(line_data, filename)
  local result = {}
  for _, row in ipairs(line_data) do
    if row.filename == filename or row.filename:sub(-#filename) == filename then
      result[#result + 1] = row
    end
  end
  return result
end

return M

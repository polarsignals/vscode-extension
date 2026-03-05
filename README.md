# Polar Signals Profiler for VS Code

View profiling data from Parca or Polar Signals Cloud directly in VS Code with inline code annotations.

## Features

- **Dual-mode support**: Connect to self-hosted Parca (OSS) or Polar Signals Cloud
- **Inline annotations**: See CPU time, memory allocations, and other metrics directly in your code
- **Preset queries**: Quick access to common profiling scenarios (On-CPU, Off-CPU, Memory, etc.)
- **Deep linking**: Open VS Code from Parca/Polar Signals Cloud.
- **Session caching**: Annotations persist as you navigate between files

## Configuration

### First-Time Setup

On first use, the extension will prompt you to choose a mode:

1. **Polar Signals Cloud**: Uses OAuth to sign in with your Polar Signals account
2. **Self-hosted Parca**: Connects to a local or remote Parca instance (no authentication)

## Usage

### Quick Start with Presets

1. Open a source file in VS Code
2. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run: **Polar Signals: Select Preset**
4. Choose a preset (e.g., "On-CPU (15min)")
5. Profiling annotations appear inline in your code

### Fetch Profile with Custom Query

1. Open a source file in VS Code
2. Open Command Palette
3. Run: **Polar Signals: Fetch Profile for Current File**
4. Configure the query (profile type, time range, labels)
5. The extension fetches and displays profiling data

### Import from URL

1. Copy a URL from Parca or Polar Signals Cloud
2. Run: **Polar Signals: Import from URL**
3. Paste the URL
4. The extension imports the query configuration

### Settings

The extension supports the following settings (prefix: `polarSignals.*`):

| Setting                         | Description                        | Default                                           |
| ------------------------------- | ---------------------------------- | ------------------------------------------------- |
| `polarSignals.mode`             | Connection mode (`cloud` or `oss`) | _(set during setup)_                              |
| `polarSignals.cloudUrl`         | Polar Signals Cloud API URL        | `https://api.polarsignals.com`                    |
| `polarSignals.selfHostedUrl`    | Self-hosted Parca URL              | `http://localhost:7070`                           |
| `polarSignals.defaultTimeRange` | Default time range for queries     | `1h`                                              |
| `polarSignals.profileType`      | Default profile type               | `parca_agent:samples:count:cpu:nanoseconds:delta` |
| `polarSignals.presets`          | Custom query presets               | `[]`                                              |

### Authentication (Cloud Mode)

For Polar Signals Cloud, the extension uses OAuth authentication. During setup, you'll be redirected to sign in with your Polar Signals account. Tokens are securely stored using VS Code's Secret Storage API.

## Commands

| Command                                            | Description                                          |
| -------------------------------------------------- | ---------------------------------------------------- |
| `Polar Signals: Fetch Profile for Current File`    | Fetch profiling data with full configuration         |
| `Polar Signals: Select Preset`                     | Quick fetch using a preset configuration             |
| `Polar Signals: Quick Actions`                     | Show status bar menu with common actions             |
| `Polar Signals: Import from URL`                   | Import query from a Parca or Polar Signals Cloud URL |
| `Polar Signals: Clear Profiling Annotations`       | Remove all profiling annotations                     |
| `Polar Signals: Configure Defaults`                | Open extension settings                              |
| `Polar Signals: Setup Mode`                        | Re-run the setup wizard to change mode               |
| `Polar Signals: Sign Out from Polar Signals Cloud` | Sign out and remove stored credentials               |

## Built-in Presets

- **On-CPU**: CPU profile samples (15min, 1h, 24h)
- **Off-CPU**: Time spent waiting/blocked (15min, 1h)
- **Memory Allocations**: Memory allocations during time period
- **Memory In-Use**: Currently allocated memory
- **Goroutines**: Goroutine creation stack traces
- **Mutex Contention**: Time spent waiting on mutex locks
- **Block Contention**: Time spent blocked on synchronization

## Development

### Prerequisites

- VS Code 1.85.0 or later
- Node.js and pnpm

### Setup

1. Install dependencies:

```bash
cd vscode-extension
pnpm install
```

2. Compile the extension:

```bash
pnpm run compile
```

3. Test the extension:
   - Open this directory in VS Code
   - Press F5 to launch Extension Development Host
   - In the new window, open a source file from your project
   - On first use, a setup wizard will guide you through configuration

### Watch Mode

Run TypeScript compiler in watch mode:

```bash
pnpm run watch
```

### Testing

1. Make code changes
2. Press F5 in VS Code to launch Extension Development Host
3. Test your changes in the new window
4. Use Developer Tools (Help → Toggle Developer Tools) to debug

## Troubleshooting

### "No profiling data found"

- Ensure the file you're viewing has profiling data
- Check that the time range includes data for this file
- Verify your query labels match the profiled application

### Connection errors (OSS mode)

- Verify Parca is running at the configured URL
- Check `polarSignals.selfHostedUrl` in settings
- Ensure the URL uses the correct protocol (HTTP for localhost, HTTPS for remote)

### Authentication errors (Cloud mode)

- Try signing out and signing back in via **Polar Signals: Sign Out from Polar Signals Cloud**
- Ensure you have access to the selected project

### Extension not loading

- Check VS Code version (must be 1.85.0+)
- Run `pnpm run compile` to rebuild
- Check the Output panel (View → Output → Polar Signals Profiler) for errors

## License

Apache-2.0

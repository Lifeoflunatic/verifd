# Node 22 Setup Guide

## Why Node 22?

The verifd project requires **Node.js v22.x LTS** for compatibility with `better-sqlite3`, our SQLite database driver. Node 24 and other versions may cause compilation errors.

## Installation Methods

### Option 1: Homebrew (macOS)
```bash
brew install node@22
brew link --overwrite node@22
```

### Option 2: NVM (Node Version Manager)
```bash
# Install nvm (if not already installed)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install and use Node 22
nvm install 22
nvm use 22
nvm alias default 22
```

### Option 3: FNM (Fast Node Manager)
```bash
# Install fnm (if not already installed)
curl -fsSL https://fnm.vercel.app/install | bash

# Install and use Node 22
fnm install 22
fnm use 22
fnm default 22
```

### Option 4: Official Node.js Installer
Download Node 22 LTS from: https://nodejs.org/en/download/

## Verification

After installation, verify your Node version:
```bash
node --version  # Should show v22.x.x
```

Run our version check script:
```bash
pnpm check:node
```

## Automatic Version Switching

The project includes version files for automatic switching:
- `.nvmrc` - for NVM users
- `.tool-versions` - for asdf users
- `.node-version` - for fnm/nodenv users

If you use these tools, they'll automatically switch to Node 22 when you enter the project directory.

## CI/CD Configuration

Our CI/CD pipelines are configured to use Node 22:
- GitHub Actions: `.github/workflows/*.yml`
- Vercel: `package.json` engines field
- Local checks: `scripts/check-node-version.js`

## Troubleshooting

### better-sqlite3 Compilation Errors

If you see errors like:
```
error: no member named 'c_str' in 'v8::String::Utf8Value'
```

This means you're not using Node 22. Follow the installation steps above.

### Rebuild Dependencies

After switching to Node 22, rebuild native dependencies:
```bash
pnpm rebuild better-sqlite3
# or
pnpm install --force
```

### Clean Installation

If issues persist, try a clean installation:
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Related Issues

- better-sqlite3 Node 24 compatibility: https://github.com/WiseLibs/better-sqlite3/issues/1177
- Node.js version support: https://nodejs.org/en/about/previous-releases

## Project Configuration

The Node 22 requirement is enforced in multiple places:
- `package.json`: `"engines": { "node": "22.x" }`
- `.nvmrc`: `22`
- `scripts/check-node-version.js`: Runtime check
- CI workflows: Uses `node-version: '22'`
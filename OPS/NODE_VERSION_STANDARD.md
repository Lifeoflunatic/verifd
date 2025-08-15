# Node.js Version Standard

## Current Standard: Node.js 22 LTS

This repository is standardized on **Node.js 22 LTS** to ensure compatibility with native dependencies, particularly `better-sqlite3`.

## Version Enforcement

- **`.nvmrc`**: Contains `22` for nvm users
- **`.tool-versions`**: Contains `nodejs 22.11.0` for asdf users  
- **`package.json`**: `engines.node` set to `22.x`
- **CI/CD**: All GitHub Actions workflows use Node 22
- **Vercel**: Project settings should be configured for Node.js 22.x

## Local Development Setup

```bash
# Using nvm
nvm install 22
nvm use 22

# Using asdf
asdf install nodejs 22.11.0
asdf local nodejs 22.11.0

# Verify version
node -v  # Should show v22.x.x

# Clean install dependencies
rm -rf node_modules **/node_modules
pnpm install
```

## Why Node 22?

1. **Native dependency compatibility**: `better-sqlite3` has stable prebuilt binaries for Node 22
2. **LTS stability**: Node 22 is the current LTS version with long-term support
3. **No compilation needed**: Avoids native build toolchain requirements on developer machines
4. **CI/CD reliability**: Consistent builds across local development and CI environments

## Troubleshooting

If you encounter native module errors:

```bash
# Clean and rebuild
pnpm -r clean || true
rm -rf node_modules **/node_modules
pnpm install

# Force rebuild native modules
pnpm -w rebuild better-sqlite3
```

## Migration from Other Versions

If you were using Node 20 or 24:

1. Install Node 22 using your version manager
2. Clean all node_modules
3. Run `pnpm install` to get fresh dependencies
4. The postinstall script will automatically rebuild native deps

## CI/CD Configuration

All workflows are configured to use Node 22:
- Backend tests run on Node 22
- Web verify tests run on Node 22  
- Android builds use Node 22
- Deployment workflows use Node 22

## Production Deployment

Ensure your deployment platforms are configured for Node 22:
- **Vercel**: Set Node.js Version to 22.x in project settings
- **Other platforms**: Use Node 22 runtime or Docker image
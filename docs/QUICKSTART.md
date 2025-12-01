# GitLab Claude Manager - Quick Start Guide

## 🎉 Project Successfully Initialized!

Your GitLab Claude Manager TypeScript project has been successfully created with a complete, production-ready structure.

## 📋 What's Been Created

### ✅ Core Project Structure

```
gitlab-claude-manager/
├── 📦 package.json              # Complete with all dependencies
├── ⚙️  tsconfig.json             # Strict TypeScript configuration
├── 🧪 jest.config.js            # Testing configuration
├── 🚫 .gitignore               # Comprehensive ignore patterns
├── 📖 README.md                # Detailed documentation
├── 🔧 env.example              # Environment template
├── 🚀 QUICKSTART.md            # This guide
├── src/                        # Source code
│   ├── 🎯 index.ts             # CLI entry point
│   ├── 📐 types/index.ts       # Type definitions

│   ├── 🔧 utils/gitOperations.ts     # Git utilities
│   └── ⚙️  config/settings.ts        # Configuration
├── 🧪 tests/unit/types.test.ts  # Unit tests
└── 📚 examples/basic-usage.ts   # Usage examples
```

### ✅ Key Features Implemented

1. **🔒 Strict TypeScript Setup**

   - Comprehensive type definitions with branded types
   - Strict compiler options for maximum safety
   - Full IntelliSense support

2. **🏗️ Solid Architecture Foundation**

   - Repository management system
   - Claude Code CLI integration for AI analysis
   - Git operations utilities
   - Configuration management

3. **🎯 CLI Interface Ready**

   - Commander.js-based CLI
   - Colorful output with Chalk
   - All planned commands structured

4. **📦 Complete Dependencies**
   - GitLab API integration ready
   - Claude Code integration prepared
   - Testing framework configured
   - Development tools included

## 🚀 Next Steps

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

```bash
cp env.example .env
```

Edit `.env` with your GitLab and Claude credentials.

### 3. Test the CLI

Try the development command:

```bash
pnpm dev
```

Or test specific commands:

```bash
pnpm dev -- --help
pnpm dev -- dev
```

### 4. Build the Project

```bash
pnpm build
```

### 5. Run Tests

```bash
pnpm test
```

## 🛠️ Implementation Status

### ✅ Completed (Foundation)

- [x] TypeScript project structure
- [x] Type definitions and interfaces
- [x] CLI interface framework
- [x] Configuration management
- [x] Testing setup
- [x] Development workflow

### 🚧 In Progress (Core Logic)

- [ ] RepositoryManager implementation
- [ ] WorkspaceManager implementation

- [ ] GitLab API client
- [ ] Claude Code integration

### 📋 Planned (Advanced Features)

- [ ] Natural language query processing
- [ ] Advanced caching strategies
- [ ] Security validation
- [ ] Performance optimization
- [ ] Web interface

## 🎯 Available Commands

The CLI is already structured and ready. Currently available:

**Basic commands (stubs ready for implementation):**

```bash
pnpm dev -- clone <repo-url> [--branch <branch>]
pnpm dev -- analyze <workspace-id> [--directory <dir>]
pnpm dev -- list [--all]
pnpm dev -- list-workspaces
pnpm dev -- cleanup [workspace-id] [--force]
pnpm dev -- ask <workspace-id> "<question>"
```

**Development utilities:**

```bash
pnpm dev -- dev
pnpm build
pnpm test
pnpm lint
pnpm type-check
```

## 🔧 Development Workflow

### Adding New Features

1. Define types in `src/types/`
2. Implement logic in `src/managers/` or `src/utils/`
3. Add CLI commands in `src/index.ts`
4. Write tests in `tests/`
5. Update documentation

### Testing

Run all tests:

```bash
pnpm test
```

Watch mode:

```bash
pnpm test:watch
```

With coverage:

```bash
pnpm test:coverage
```

### Code Quality

Check code style:

```bash
pnpm lint
```

Fix auto-fixable issues:

```bash
pnpm lint:fix
```

TypeScript type checking:

```bash
pnpm type-check
```

## 📚 Key Files to Know

- **`src/types/index.ts`**: All TypeScript types and interfaces
- **`src/index.ts`**: Main CLI entry point and command definitions
- **`src/config/settings.ts`**: Environment configuration management
- **`package.json`**: Project configuration and scripts
- **`tsconfig.json`**: TypeScript compiler configuration

## 🎉 You're Ready!

Your GitLab Claude Manager project is now ready for development. The foundation is solid, the architecture is clean, and the TypeScript setup is strict and comprehensive.

**Start by running:**

```bash
pnpm dev -- dev
```

This will show you the current status and available commands.

## 📞 Need Help?

- Check `README.md` for detailed documentation
- Look at `examples/basic-usage.ts` for usage patterns
- Review `tests/unit/types.test.ts` for type examples
- All CLI commands have `--help` options

Happy coding! 🚀

## 🔌 Adding MCP Servers to Claude Code

To add MCP (Model Context Protocol) servers to Claude Code running in the container:

**1. Exec into the container:**

```bash
docker exec -it workflow-app /bin/bash
```

**2. Navigate to Claude config:**

```bash
cd ~/.claude
```

**3. Edit the MCP configuration:**

```bash
nano settings.local.json
```

Add your MCP server(s) using this pattern:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"]
    }
  }
}
```

**4. Exit and restart (if needed):**

```bash
exit
docker restart workflow-app
```

> **Note**: See [CREDENTIALS.md](./CREDENTIALS.md#claude-code-mcp-server-issues) for important considerations about MCP server usage in headless environments.

## 🔧 VirtualBox Testing Environment

For testing the GitLab Claude Manager in an isolated environment, you can set up a VirtualBox Ubuntu Linux VM. This is particularly useful for testing Git operations, workspace management, and ensuring cross-platform compatibility.

### 📋 Prerequisites

- VirtualBox installed on your host machine
- Ubuntu Linux ISO (recommended: Ubuntu 22.04 LTS)
- At least 4GB RAM and 20GB disk space allocated to VM

### 🚀 VM Setup

#### 1. Create Ubuntu Virtual Machine

1. **Download Ubuntu**: Get the latest Ubuntu Desktop/Server ISO from [ubuntu.com](https://ubuntu.com/download)
2. **VirtualBox Setup**: Follow this comprehensive guide for VM creation:
   - 📺 [Ubuntu VirtualBox Setup Tutorial](https://www.youtube.com/watch?v=wqm_DXh0PlQ)
3. **System Requirements**:
   - Memory: 4GB minimum (8GB recommended)
   - Storage: 20GB minimum
   - Network: NAT or Bridged Adapter

#### 2. SSH Configuration

Set up SSH for easier development workflow:

**On your host machine:**

Generate SSH key pair (if you don't have one):

```bash
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
```

Copy your public key:

```bash
cat ~/.ssh/id_rsa.pub
```

**On the Ubuntu VM:**

Create .ssh directory:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
```

Add your public key to authorized_keys:

```bash
echo "your-public-key-content" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Configure SSH daemon:

```bash
sudo nano /etc/ssh/sshd_config
```

**SSH Configuration (`/etc/ssh/sshd_config`):**

```bash
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
PermitRootLogin yes
```

**Restart SSH service:**

```bash
sudo systemctl restart ssh
sudo systemctl enable ssh
```

#### 3. Shared Folder Setup

Mount your project directory for seamless development:

**In VirtualBox Manager:**

1. Go to VM Settings → Shared Folders
2. Add new shared folder:
   - **Folder Path**: Path to your `workflow` directory on host
   - **Folder Name**: `gitlab-claude-manager`
   - **Options**: ✅ Auto-mount, ✅ Make Permanent

**On the Ubuntu VM:**

Install VirtualBox Guest Additions (if not already installed):

```bash
sudo apt update
sudo apt install virtualbox-guest-additions-iso
```

Create mount point:

```bash
sudo mkdir -p /opt/gitlab-claude-manager
```

Add to fstab for automatic mounting:

```bash
echo "gitlab-claude-manager /opt/gitlab-claude-manager vboxsf defaults,uid=1000,gid=1000 0 0" | sudo tee -a /etc/fstab
```

Add user to vboxsf group:

```bash
sudo addgroup vboxsf
sudo adduser $USER vboxsf
```

Mount the shared folder:

```bash
sudo mount -a
```

Restart VM to apply all changes:

```bash
sudo reboot
```

### 🛠️ Development Setup in VM

After VM setup, install the development environment:

Update system:

```bash
sudo apt update && sudo apt upgrade -y
```

Install Node.js (using NodeSource repository):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Install Git:

```bash
sudo apt install git -y
```

Navigate to shared project directory:

```bash
cd /opt/gitlab-claude-manager
```

Install dependencies:

```bash
pnpm install
```

Test the application:

```bash
pnpm dev -- dev
```

### 🔍 Testing Workflow

1. **SSH into VM** from your host machine:

   ```bash
   ssh username@vm-ip-address
   ```

2. **Navigate to project**:

   ```bash
   cd /opt/gitlab-claude-manager
   ```

3. **Run tests**:

   ```bash
   pnpm test
   pnpm type-check
   pnpm lint
   ```

4. **Test GitLab integration**:

   Configure environment:

   ```bash
   cp env.example .env
   ```

   Edit .env with your GitLab token.

   Test repository cloning:

   ```bash
   pnpm dev -- clone https://gitlab.com/your-test-repo.git
   ```

### 💡 Benefits of VM Testing

- **Isolation**: Test without affecting your host system
- **Clean Environment**: Fresh Ubuntu installation mimics production
- **Cross-Platform**: Ensure compatibility across different Linux distributions
- **Reproducible**: Easy to snapshot and restore VM states
- **Security**: Test with different permission models

### 🔧 Troubleshooting

**Common Issues:**

1. **Shared folder not mounting**:

   Check if Guest Additions are installed:

   ```bash
   lsmod | grep vboxsf
   ```

   Reinstall if necessary:

   ```bash
   sudo apt install virtualbox-guest-utils
   ```

2. **SSH connection refused**:

   Check SSH service status:

   ```bash
   sudo systemctl status ssh
   ```

   Check firewall:

   ```bash
   sudo ufw status
   sudo ufw allow ssh
   ```

3. **Permission denied on shared folder**:

   Ensure user is in vboxsf group:

   ```bash
   groups $USER
   ```

   Add user to group if missing:

   ```bash
   sudo adduser $USER vboxsf
   ```

4. **Claude CLI headless calls failing or hanging**:
   - This often indicates issues with Claude Code MCP server configuration
   - **Recommended**: Configure Claude Code WITHOUT GitLab MCP server integration
   - The application handles all git operations manually (before/after Claude Code execution)
   - See detailed troubleshooting in [CREDENTIALS.md](./CREDENTIALS.md#claude-code-mcp-server-issues)

This VM setup provides a robust testing environment for the GitLab Claude Manager, ensuring compatibility and reliability across different systems.

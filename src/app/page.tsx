import { Link } from "@heroui/link";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";

import { title, subtitle } from "@/components/primitives";
import { GithubIcon } from "@/components/icons";

export default function Home() {
  return (
    <div className="flex flex-col min-h-full">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center gap-6 py-16 md:py-24 text-center relative">
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 via-red-500/15 to-orange-600/20 rounded-3xl blur-3xl" />
        <div className="relative z-10 max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className="px-3 py-1 bg-gradient-to-r from-red-500/20 to-red-600/20 border border-red-300/30 rounded-full text-sm font-medium text-red-700 dark:text-red-300">
              🕷️ AI-Powered
            </span>
            <span className="px-3 py-1 bg-gradient-to-r from-orange-500/20 to-orange-600/20 border border-orange-300/30 rounded-full text-sm font-medium text-orange-700 dark:text-orange-300">
              ⚡ Lightning Fast
            </span>
          </div>
          
          <h1 className="mb-6">
            <span className={title({ size: "lg" })}>Welcome to&nbsp;</span>
            <span className={title({ size: "lg" })} style={{ background: 'linear-gradient(to right, #dc2626, #1e40af)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Code
            </span>
            <span className={title({ size: "lg" })} style={{ background: 'linear-gradient(to right, #1e40af, #dc2626)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Spider
            </span>
          </h1>
          
          <div className={subtitle({ class: "mb-8" })}>
            🚀 Weave through your codebase with AI-powered intelligence. 
            <br />
            Analyze, manage, and optimize your development workflow like never before!
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <Button 
              size="lg" 
              color="primary" 
              variant="shadow"
              className="bg-gradient-to-r from-red-600 to-red-700 font-semibold px-8 text-white"
            >
              Get Started 🎯
            </Button>
            <Button 
              size="lg" 
              variant="bordered" 
              className="border-red-300 text-red-600 dark:border-red-400 dark:text-red-400 font-semibold px-8 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              View Demo 👁️
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="flex-1 py-12 px-6 mb-16">
        <div className="max-w-7xl mx-auto relative">
          {/* Blur effects for natural inset/outset */}
          <div className="absolute -inset-8 bg-gradient-to-r from-transparent via-red-50/20 to-transparent blur-xl rounded-3xl dark:via-red-950/10"></div>
          <div className="absolute -inset-4 bg-gradient-to-b from-background/60 to-background/80 rounded-2xl shadow-inner"></div>
          
          <div className="relative z-10 p-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                Powerful Development Tools
              </h2>
              <p className="text-lg text-default-600 max-w-2xl mx-auto">
                Everything you need to manage, analyze, and optimize your code repositories
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Clone Repository Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-green-400 to-emerald-600 rounded-lg">
                  <span className="text-white text-xl">🔄</span>
                </div>
                <h4 className="font-bold text-xl">Clone Repository</h4>
              </div>
              <p className="text-default-600 mb-4">
                Seamlessly clone and sync repositories from various platforms
              </p>
              <div className="flex flex-col gap-3">
                <Input
                  type="url"
                  label="Repository URL"
                  placeholder="https://gitlab.com/user/repo.git"
                  variant="bordered"
                  classNames={{
                    input: "bg-background/50",
                    inputWrapper: "border-default-200 hover:border-red-300 focus-within:border-red-400"
                  }}
                />
                <Input
                  type="text"
                  label="Branch (optional)"
                  placeholder="main"
                  variant="bordered"
                  classNames={{
                    input: "bg-background/50",
                    inputWrapper: "border-default-200 hover:border-red-300 focus-within:border-red-400"
                  }}
                />
                <Button 
                  color="success" 
                  variant="shadow"
                  className="bg-gradient-to-r from-green-500 to-emerald-600 font-medium"
                >
                  Clone Repository
                </Button>
              </div>
            </div>

            {/* Analyze Workspace Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-red-400 to-red-600 rounded-lg">
                  <span className="text-white text-xl">🔍</span>
                </div>
                <h4 className="font-bold text-xl">AI Analysis</h4>
              </div>
              <p className="text-default-600 mb-4">
                Let Claude AI understand and analyze your codebase structure
              </p>
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  label="Workspace ID"
                  placeholder="Enter workspace ID"
                  variant="bordered"
                  classNames={{
                    input: "bg-background/50",
                    inputWrapper: "border-default-200 hover:border-red-300 focus-within:border-red-400"
                  }}
                />
                <Input
                  type="text"
                  label="Directory (optional)"
                  placeholder="."
                  variant="bordered"
                  classNames={{
                    input: "bg-background/50",
                    inputWrapper: "border-default-200 hover:border-red-300 focus-within:border-red-400"
                  }}
                />
                <Button 
                  color="secondary" 
                  variant="shadow"
                  className="bg-gradient-to-r from-red-500 to-red-600 font-medium text-white"
                >
                  Analyze with Claude
                </Button>
              </div>
            </div>

            {/* Workspaces Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg">
                  <span className="text-white text-xl">📋</span>
                </div>
                <h4 className="font-bold text-xl">Workspaces</h4>
              </div>
              <p className="text-default-600 mb-4">
                Organize and manage your development environments
              </p>
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/50 dark:to-indigo-950/50 rounded-lg border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                    3 active workspaces
                  </p>
                </div>
                <Button 
                  color="primary" 
                  variant="shadow"
                  className="bg-gradient-to-r from-blue-500 to-blue-600 font-medium"
                >
                  Manage Workspaces
                </Button>
                <Button 
                  color="warning" 
                  variant="bordered"
                  className="border-orange-300 text-orange-600 dark:border-orange-400 dark:text-orange-400"
                >
                  Clean Up
                </Button>
              </div>
            </div>

            {/* Cache Management Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-cyan-400 to-cyan-600 rounded-lg">
                  <span className="text-white text-xl">💾</span>
                </div>
                <h4 className="font-bold text-xl">Smart Cache</h4>
              </div>
              <p className="text-default-600 mb-4">
                Intelligent caching for lightning-fast performance
              </p>
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gradient-to-r from-cyan-50 to-teal-50 dark:from-cyan-950/50 dark:to-teal-950/50 rounded-lg border border-cyan-200 dark:border-cyan-800">
                  <p className="text-sm text-cyan-700 dark:text-cyan-300 font-medium">
                    Cache: 94% efficient
                  </p>
                </div>
                <Button 
                  color="default" 
                  variant="shadow"
                  className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white font-medium"
                >
                  View Stats
                </Button>
                <Button 
                  color="danger" 
                  variant="bordered"
                  className="border-red-300 text-red-600 dark:border-red-400 dark:text-red-400"
                >
                  Clear Cache
                </Button>
              </div>
            </div>

            {/* Claude Integration Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-red-400 to-red-600 rounded-lg">
                  <span className="text-white text-xl">🤖</span>
                </div>
                <h4 className="font-bold text-xl">Claude Assistant</h4>
              </div>
              <p className="text-default-600 mb-4">
                Get intelligent code insights and suggestions
              </p>
              <div className="flex flex-col gap-3">
                <Input
                  type="text"
                  label="Ask Claude"
                  placeholder="How can I optimize this code?"
                  variant="bordered"
                  classNames={{
                    input: "bg-background/50",
                    inputWrapper: "border-default-200 hover:border-red-300 focus-within:border-red-400"
                  }}
                />
                <Button 
                  color="secondary" 
                  variant="shadow"
                  className="bg-gradient-to-r from-red-500 to-red-600 font-medium text-white"
                >
                  Ask Claude
                </Button>
              </div>
            </div>

            {/* GitHub Integration Card */}
            <div className="glass-card hover:scale-105 transition-all duration-300 rounded-xl p-6 shadow-lg hover:shadow-red-200/50 dark:hover:shadow-red-900/20">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-gradient-to-br from-gray-700 to-gray-900 rounded-lg">
                  <GithubIcon size={20} className="text-white" />
                </div>
                <h4 className="font-bold text-xl">GitHub Sync</h4>
              </div>
              <p className="text-default-600 mb-4">
                Seamless integration with GitHub repositories
              </p>
              <div className="flex flex-col gap-3">
                <div className="p-3 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-950/50 dark:to-slate-950/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    Connected to 5 repos
                  </p>
                </div>
                <Link
                  href="https://github.com/yourusername/codespider"
                  target="_blank"
                  className="w-full"
                >
                  <Button 
                    color="default" 
                    variant="shadow" 
                    className="w-full bg-gradient-to-r from-gray-700 to-gray-900 text-white font-medium"
                  >
                    View on GitHub
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      </section>
    </div>
  );
}

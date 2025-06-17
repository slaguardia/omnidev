module.exports = {

"[project]/.next-internal/server/app/api/workspaces/route/actions.js [app-rsc] (server actions loader, ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({});
}}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}}),
"[externals]/node:fs/promises [external] (node:fs/promises, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("node:fs/promises", () => require("node:fs/promises"));

module.exports = mod;
}}),
"[externals]/node:path [external] (node:path, cjs)": (function(__turbopack_context__) {

var { g: global, __dirname, m: module, e: exports } = __turbopack_context__;
{
const mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}}),
"[project]/src/managers/WorkspaceManager.ts [app-route] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
/**
 * Workspace Manager - Persistent workspace management
 */ __turbopack_context__.s({
    "WorkspaceManager": (()=>WorkspaceManager)
});
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs$2f$promises__$5b$external$5d$__$28$node$3a$fs$2f$promises$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs/promises [external] (node:fs/promises, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
(()=>{
    const e = new Error("Cannot find module '@/config/settings.js'");
    e.code = 'MODULE_NOT_FOUND';
    throw e;
})();
;
;
;
class WorkspaceManager {
    workspaceIndexPath;
    workspaceIndex;
    constructor(){
        const workspaceBaseDir = getWorkspaceBaseDir();
        this.workspaceIndexPath = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["join"])(workspaceBaseDir, '.workspace-index.json');
        this.workspaceIndex = {
            workspaces: {},
            lastUpdated: new Date().toISOString(),
            version: '1.0.0'
        };
    }
    /**
   * Initialize workspace manager (load existing workspaces)
   */ async initialize() {
        try {
            await this.loadWorkspaceIndex();
            return {
                success: true,
                data: undefined
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to initialize workspace manager: ${error}`)
            };
        }
    }
    /**
   * Save workspace to persistent storage
   */ async saveWorkspace(workspace) {
        try {
            this.workspaceIndex.workspaces[workspace.id] = workspace;
            this.workspaceIndex.lastUpdated = new Date().toISOString();
            await this.saveWorkspaceIndex();
            return {
                success: true,
                data: undefined
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to save workspace: ${error}`)
            };
        }
    }
    /**
   * Load workspace from persistent storage
   */ async loadWorkspace(workspaceId) {
        try {
            await this.loadWorkspaceIndex();
            const workspace = this.workspaceIndex.workspaces[workspaceId];
            if (!workspace) {
                return {
                    success: false,
                    error: new Error(`Workspace ${workspaceId} not found`)
                };
            }
            // Update last accessed time
            workspace.lastAccessed = new Date();
            await this.saveWorkspace(workspace);
            return {
                success: true,
                data: workspace
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to load workspace: ${error}`)
            };
        }
    }
    /**
   * Get all workspaces from persistent storage
   */ async getAllWorkspaces() {
        try {
            await this.loadWorkspaceIndex();
            const workspaces = Object.values(this.workspaceIndex.workspaces).sort((a, b)=>new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime());
            return {
                success: true,
                data: workspaces
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to get all workspaces: ${error}`)
            };
        }
    }
    /**
   * Delete workspace from persistent storage
   */ async deleteWorkspace(workspaceId) {
        try {
            delete this.workspaceIndex.workspaces[workspaceId];
            this.workspaceIndex.lastUpdated = new Date().toISOString();
            await this.saveWorkspaceIndex();
            return {
                success: true,
                data: undefined
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to delete workspace: ${error}`)
            };
        }
    }
    /**
   * Update workspace in persistent storage
   */ async updateWorkspace(workspace) {
        try {
            if (!this.workspaceIndex.workspaces[workspace.id]) {
                return {
                    success: false,
                    error: new Error(`Workspace ${workspace.id} not found`)
                };
            }
            return await this.saveWorkspace(workspace);
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to update workspace: ${error}`)
            };
        }
    }
    /**
   * Check if workspace exists in storage
   */ async workspaceExists(workspaceId) {
        try {
            await this.loadWorkspaceIndex();
            return workspaceId in this.workspaceIndex.workspaces;
        } catch  {
            return false;
        }
    }
    /**
   * Get workspace statistics
   */ async getWorkspaceStats() {
        try {
            const result = await this.getAllWorkspaces();
            if (!result.success) {
                return result;
            }
            const workspaces = result.data;
            const active = workspaces.filter((ws)=>ws.metadata?.isActive);
            const totalSize = workspaces.reduce((sum, ws)=>sum + (ws.metadata?.size || 0), 0);
            const accessTimes = workspaces.map((ws)=>new Date(ws.lastAccessed));
            const oldestAccess = accessTimes.length > 0 ? new Date(Math.min(...accessTimes.map((d)=>d.getTime()))) : null;
            const newestAccess = accessTimes.length > 0 ? new Date(Math.max(...accessTimes.map((d)=>d.getTime()))) : null;
            return {
                success: true,
                data: {
                    total: workspaces.length,
                    active: active.length,
                    inactive: workspaces.length - active.length,
                    totalSize,
                    oldestAccess,
                    newestAccess
                }
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to get workspace stats: ${error}`)
            };
        }
    }
    /**
   * Cleanup old workspaces (mark as inactive or delete)
   */ async cleanupOldWorkspaces(maxAgeHours = 24 * 7) {
        try {
            const result = await this.getAllWorkspaces();
            if (!result.success) {
                return result;
            }
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
            let cleanedCount = 0;
            for (const workspace of result.data){
                if (new Date(workspace.lastAccessed) < cutoffTime && workspace.metadata?.isActive) {
                    workspace.metadata.isActive = false;
                    await this.saveWorkspace(workspace);
                    cleanedCount++;
                }
            }
            return {
                success: true,
                data: cleanedCount
            };
        } catch (error) {
            return {
                success: false,
                error: new Error(`Failed to cleanup old workspaces: ${error}`)
            };
        }
    }
    /**
   * Load workspace index from disk
   */ async loadWorkspaceIndex() {
        try {
            await (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs$2f$promises__$5b$external$5d$__$28$node$3a$fs$2f$promises$2c$__cjs$29$__["stat"])(this.workspaceIndexPath);
            const content = await (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs$2f$promises__$5b$external$5d$__$28$node$3a$fs$2f$promises$2c$__cjs$29$__["readFile"])(this.workspaceIndexPath, 'utf-8');
            this.workspaceIndex = JSON.parse(content);
            // Convert date strings back to Date objects
            Object.values(this.workspaceIndex.workspaces).forEach((workspace)=>{
                workspace.createdAt = new Date(workspace.createdAt);
                workspace.lastAccessed = new Date(workspace.lastAccessed);
            });
        } catch  {
            // File doesn't exist or is corrupted, start with empty index
            this.workspaceIndex = {
                workspaces: {},
                lastUpdated: new Date().toISOString(),
                version: '1.0.0'
            };
        }
    }
    /**
   * Save workspace index to disk
   */ async saveWorkspaceIndex() {
        const content = JSON.stringify(this.workspaceIndex, null, 2);
        await (0, __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs$2f$promises__$5b$external$5d$__$28$node$3a$fs$2f$promises$2c$__cjs$29$__["writeFile"])(this.workspaceIndexPath, content, 'utf-8');
    }
    /**
   * Get workspace index file path
   */ getIndexPath() {
        return this.workspaceIndexPath;
    }
}
}}),
"[project]/src/app/api/workspaces/route.ts [app-route] (ecmascript)": ((__turbopack_context__) => {
"use strict";

var { g: global, __dirname } = __turbopack_context__;
{
__turbopack_context__.s({
    "GET": (()=>GET)
});
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$managers$2f$WorkspaceManager$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/managers/WorkspaceManager.ts [app-route] (ecmascript)");
;
;
const workspaceManager = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$managers$2f$WorkspaceManager$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["WorkspaceManager"]();
async function GET() {
    try {
        // Initialize workspace manager
        const initResult = await workspaceManager.initialize();
        if (!initResult.success) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Failed to initialize workspace manager',
                details: initResult.error?.message
            }, {
                status: 500
            });
        }
        // Get all workspaces
        const workspacesResult = await workspaceManager.getAllWorkspaces();
        if (!workspacesResult.success) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Failed to get workspaces',
                details: workspacesResult.error?.message
            }, {
                status: 500
            });
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            workspaces: workspacesResult.data
        });
    } catch (error) {
        console.error('Error in workspaces API:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : String(error)
        }, {
            status: 500
        });
    }
}
}}),

};

//# sourceMappingURL=%5Broot-of-the-server%5D__314a8482._.js.map
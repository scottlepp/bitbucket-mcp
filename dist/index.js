#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import winston from "winston";
// =========== LOGGER SETUP ===========
// Simple logger that only writes to a file (no stdout pollution)
const logger = winston.createLogger({
    level: "info",
    format: winston.format.json(),
    transports: [new winston.transports.File({ filename: "bitbucket.log" })],
});
// =========== MCP SERVER ===========
class BitbucketServer {
    constructor() {
        // Initialize with the older Server class pattern
        this.server = new Server({
            name: "bitbucket-mcp-server",
            version: "1.0.0",
        }, {
            capabilities: {
                tools: {},
            },
        });
        // Configuration from environment variables
        this.config = {
            baseUrl: process.env.BITBUCKET_URL ?? "https://api.bitbucket.org/2.0",
            token: process.env.BITBUCKET_TOKEN,
            username: process.env.BITBUCKET_USERNAME,
            password: process.env.BITBUCKET_PASSWORD,
            defaultWorkspace: process.env.BITBUCKET_WORKSPACE,
        };
        // Validate required config
        if (!this.config.baseUrl) {
            throw new Error("BITBUCKET_URL is required");
        }
        if (!this.config.token && !(this.config.username && this.config.password)) {
            throw new Error("Either BITBUCKET_TOKEN or BITBUCKET_USERNAME/PASSWORD is required");
        }
        // Setup Axios instance
        this.api = axios.create({
            baseURL: this.config.baseUrl,
            headers: this.config.token
                ? { Authorization: `Bearer ${this.config.token}` }
                : { "Content-Type": "application/json" },
            auth: this.config.username && this.config.password
                ? { username: this.config.username, password: this.config.password }
                : undefined,
        });
        // Setup tool handlers using the request handler pattern
        this.setupToolHandlers();
        // Add error handler - CRITICAL for stability
        this.server.onerror = (error) => logger.error("[MCP Error]", error);
    }
    setupToolHandlers() {
        // Register the list tools handler
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "listRepositories",
                    description: "List Bitbucket repositories",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            limit: {
                                type: "number",
                                description: "Maximum number of repositories to return",
                            },
                            name: {
                                type: "string",
                                description: "Filter repositories by name (partial match supported)",
                            },
                        },
                    },
                },
                {
                    name: "getRepository",
                    description: "Get repository details",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "getPullRequests",
                    description: "Get pull requests for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            state: {
                                type: "string",
                                enum: ["OPEN", "MERGED", "DECLINED", "SUPERSEDED"],
                                description: "Pull request state",
                            },
                            limit: {
                                type: "number",
                                description: "Maximum number of pull requests to return",
                            },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "createPullRequest",
                    description: "Create a new pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            title: { type: "string", description: "Pull request title" },
                            description: {
                                type: "string",
                                description: "Pull request description",
                            },
                            sourceBranch: {
                                type: "string",
                                description: "Source branch name",
                            },
                            targetBranch: {
                                type: "string",
                                description: "Target branch name",
                            },
                            reviewers: {
                                type: "array",
                                items: { type: "string" },
                                description: "List of reviewer usernames",
                            },
                            draft: {
                                type: "boolean",
                                description: "Whether to create the pull request as a draft",
                            },
                        },
                        required: [
                            "workspace",
                            "repo_slug",
                            "title",
                            "description",
                            "sourceBranch",
                            "targetBranch",
                        ],
                    },
                },
                {
                    name: "getPullRequest",
                    description: "Get details for a specific pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "updatePullRequest",
                    description: "Update a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                            title: { type: "string", description: "New pull request title" },
                            description: {
                                type: "string",
                                description: "New pull request description",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getPullRequestActivity",
                    description: "Get activity log for a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "approvePullRequest",
                    description: "Approve a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "unapprovePullRequest",
                    description: "Remove approval from a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "declinePullRequest",
                    description: "Decline a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                            message: { type: "string", description: "Reason for declining" },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "mergePullRequest",
                    description: "Merge a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                            message: { type: "string", description: "Merge commit message" },
                            strategy: {
                                type: "string",
                                enum: ["merge-commit", "squash", "fast-forward"],
                                description: "Merge strategy",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getPullRequestComments",
                    description: "List comments on a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getPullRequestDiff",
                    description: "Get diff for a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getPullRequestCommits",
                    description: "Get commits on a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "addPullRequestComment",
                    description: "Add a comment to a pull request (general or inline)",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                            content: {
                                type: "string",
                                description: "Comment content in markdown format",
                            },
                            pending: {
                                type: "boolean",
                                description: "Whether to create this comment as a pending comment (draft state)",
                            },
                            inline: {
                                type: "object",
                                description: "Inline comment information for commenting on specific lines",
                                properties: {
                                    path: {
                                        type: "string",
                                        description: "Path to the file in the repository",
                                    },
                                    from: {
                                        type: "number",
                                        description: "Line number in the old version of the file (for deleted or modified lines)",
                                    },
                                    to: {
                                        type: "number",
                                        description: "Line number in the new version of the file (for added or modified lines)",
                                    },
                                },
                                required: ["path"],
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id", "content"],
                    },
                },
                {
                    name: "addPendingPullRequestComment",
                    description: "Add a pending (draft) comment to a pull request that can be published later",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                            content: {
                                type: "string",
                                description: "Comment content in markdown format",
                            },
                            inline: {
                                type: "object",
                                description: "Inline comment information for commenting on specific lines",
                                properties: {
                                    path: {
                                        type: "string",
                                        description: "Path to the file in the repository",
                                    },
                                    from: {
                                        type: "number",
                                        description: "Line number in the old version of the file (for deleted or modified lines)",
                                    },
                                    to: {
                                        type: "number",
                                        description: "Line number in the new version of the file (for added or modified lines)",
                                    },
                                },
                                required: ["path"],
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id", "content"],
                    },
                },
                {
                    name: "publishPendingComments",
                    description: "Publish all pending comments for a pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getRepositoryBranchingModel",
                    description: "Get the branching model for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "getRepositoryBranchingModelSettings",
                    description: "Get the branching model config for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "updateRepositoryBranchingModelSettings",
                    description: "Update the branching model config for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            development: {
                                type: "object",
                                description: "Development branch settings",
                                properties: {
                                    name: { type: "string", description: "Branch name" },
                                    use_mainbranch: {
                                        type: "boolean",
                                        description: "Use main branch",
                                    },
                                },
                            },
                            production: {
                                type: "object",
                                description: "Production branch settings",
                                properties: {
                                    name: { type: "string", description: "Branch name" },
                                    use_mainbranch: {
                                        type: "boolean",
                                        description: "Use main branch",
                                    },
                                    enabled: {
                                        type: "boolean",
                                        description: "Enable production branch",
                                    },
                                },
                            },
                            branch_types: {
                                type: "array",
                                description: "Branch types configuration",
                                items: {
                                    type: "object",
                                    properties: {
                                        kind: {
                                            type: "string",
                                            description: "Branch type kind (e.g., bugfix, feature)",
                                        },
                                        prefix: { type: "string", description: "Branch prefix" },
                                        enabled: {
                                            type: "boolean",
                                            description: "Enable this branch type",
                                        },
                                    },
                                    required: ["kind"],
                                },
                            },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "getEffectiveRepositoryBranchingModel",
                    description: "Get the effective branching model for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "getProjectBranchingModel",
                    description: "Get the branching model for a project",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            project_key: { type: "string", description: "Project key" },
                        },
                        required: ["workspace", "project_key"],
                    },
                },
                {
                    name: "getProjectBranchingModelSettings",
                    description: "Get the branching model config for a project",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            project_key: { type: "string", description: "Project key" },
                        },
                        required: ["workspace", "project_key"],
                    },
                },
                {
                    name: "updateProjectBranchingModelSettings",
                    description: "Update the branching model config for a project",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            project_key: { type: "string", description: "Project key" },
                            development: {
                                type: "object",
                                description: "Development branch settings",
                                properties: {
                                    name: { type: "string", description: "Branch name" },
                                    use_mainbranch: {
                                        type: "boolean",
                                        description: "Use main branch",
                                    },
                                },
                            },
                            production: {
                                type: "object",
                                description: "Production branch settings",
                                properties: {
                                    name: { type: "string", description: "Branch name" },
                                    use_mainbranch: {
                                        type: "boolean",
                                        description: "Use main branch",
                                    },
                                    enabled: {
                                        type: "boolean",
                                        description: "Enable production branch",
                                    },
                                },
                            },
                            branch_types: {
                                type: "array",
                                description: "Branch types configuration",
                                items: {
                                    type: "object",
                                    properties: {
                                        kind: {
                                            type: "string",
                                            description: "Branch type kind (e.g., bugfix, feature)",
                                        },
                                        prefix: { type: "string", description: "Branch prefix" },
                                        enabled: {
                                            type: "boolean",
                                            description: "Enable this branch type",
                                        },
                                    },
                                    required: ["kind"],
                                },
                            },
                        },
                        required: ["workspace", "project_key"],
                    },
                },
                {
                    name: "createDraftPullRequest",
                    description: "Create a new draft pull request",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            title: { type: "string", description: "Pull request title" },
                            description: {
                                type: "string",
                                description: "Pull request description",
                            },
                            sourceBranch: {
                                type: "string",
                                description: "Source branch name",
                            },
                            targetBranch: {
                                type: "string",
                                description: "Target branch name",
                            },
                            reviewers: {
                                type: "array",
                                items: { type: "string" },
                                description: "List of reviewer usernames",
                            },
                        },
                        required: [
                            "workspace",
                            "repo_slug",
                            "title",
                            "description",
                            "sourceBranch",
                            "targetBranch",
                        ],
                    },
                },
                {
                    name: "publishDraftPullRequest",
                    description: "Publish a draft pull request to make it ready for review",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "convertTodraft",
                    description: "Convert a regular pull request to draft status",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pull_request_id: {
                                type: "string",
                                description: "Pull request ID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pull_request_id"],
                    },
                },
                {
                    name: "getPendingReviewPRs",
                    description: "List all open pull requests in the workspace where the authenticated user is a reviewer and has not yet approved.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name (optional, defaults to BITBUCKET_WORKSPACE)",
                            },
                            limit: {
                                type: "number",
                                description: "Maximum number of PRs to return (optional)",
                            },
                            repositoryList: {
                                type: "array",
                                items: { type: "string" },
                                description: "List of repository slugs to check (optional)",
                            },
                        },
                    },
                },
                {
                    name: "listPipelineRuns",
                    description: "List pipeline runs for a repository",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            limit: {
                                type: "number",
                                description: "Maximum number of pipelines to return",
                            },
                            status: {
                                type: "string",
                                enum: ["PENDING", "IN_PROGRESS", "SUCCESSFUL", "FAILED", "ERROR", "STOPPED"],
                                description: "Filter pipelines by status",
                            },
                            target_branch: {
                                type: "string",
                                description: "Filter pipelines by target branch",
                            },
                            trigger_type: {
                                type: "string",
                                enum: ["manual", "push", "pullrequest", "schedule"],
                                description: "Filter pipelines by trigger type",
                            },
                        },
                        required: ["workspace", "repo_slug"],
                    },
                },
                {
                    name: "getPipelineRun",
                    description: "Get details for a specific pipeline run",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pipeline_uuid: {
                                type: "string",
                                description: "Pipeline UUID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pipeline_uuid"],
                    },
                },
                {
                    name: "runPipeline",
                    description: "Trigger a new pipeline run",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            target: {
                                type: "object",
                                description: "Pipeline target configuration",
                                properties: {
                                    ref_type: {
                                        type: "string",
                                        enum: ["branch", "tag", "bookmark", "named_branch"],
                                        description: "Reference type",
                                    },
                                    ref_name: {
                                        type: "string",
                                        description: "Reference name (branch, tag, etc.)",
                                    },
                                    commit_hash: {
                                        type: "string",
                                        description: "Specific commit hash to run pipeline on",
                                    },
                                    selector_type: {
                                        type: "string",
                                        enum: ["default", "custom", "pull-requests"],
                                        description: "Pipeline selector type",
                                    },
                                    selector_pattern: {
                                        type: "string",
                                        description: "Pipeline selector pattern (for custom pipelines)",
                                    },
                                },
                                required: ["ref_type", "ref_name"],
                            },
                            variables: {
                                type: "array",
                                description: "Pipeline variables",
                                items: {
                                    type: "object",
                                    properties: {
                                        key: { type: "string", description: "Variable name" },
                                        value: { type: "string", description: "Variable value" },
                                        secured: {
                                            type: "boolean",
                                            description: "Whether the variable is secured",
                                        },
                                    },
                                    required: ["key", "value"],
                                },
                            },
                        },
                        required: ["workspace", "repo_slug", "target"],
                    },
                },
                {
                    name: "stopPipeline",
                    description: "Stop a running pipeline",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pipeline_uuid: {
                                type: "string",
                                description: "Pipeline UUID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pipeline_uuid"],
                    },
                },
                {
                    name: "getPipelineSteps",
                    description: "List steps for a pipeline run",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pipeline_uuid: {
                                type: "string",
                                description: "Pipeline UUID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pipeline_uuid"],
                    },
                },
                {
                    name: "getPipelineStep",
                    description: "Get details for a specific pipeline step",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pipeline_uuid: {
                                type: "string",
                                description: "Pipeline UUID",
                            },
                            step_uuid: {
                                type: "string",
                                description: "Step UUID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pipeline_uuid", "step_uuid"],
                    },
                },
                {
                    name: "getPipelineStepLogs",
                    description: "Get logs for a specific pipeline step",
                    inputSchema: {
                        type: "object",
                        properties: {
                            workspace: {
                                type: "string",
                                description: "Bitbucket workspace name",
                            },
                            repo_slug: { type: "string", description: "Repository slug" },
                            pipeline_uuid: {
                                type: "string",
                                description: "Pipeline UUID",
                            },
                            step_uuid: {
                                type: "string",
                                description: "Step UUID",
                            },
                        },
                        required: ["workspace", "repo_slug", "pipeline_uuid", "step_uuid"],
                    },
                },
            ],
        }));
        // Register the call tool handler
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                logger.info(`Called tool: ${request.params.name}`, {
                    arguments: request.params.arguments,
                });
                const args = request.params.arguments ?? {};
                switch (request.params.name) {
                    case "listRepositories":
                        return await this.listRepositories(args.workspace, args.limit, args.name);
                    case "getRepository":
                        return await this.getRepository(args.workspace, args.repo_slug);
                    case "getPullRequests":
                        return await this.getPullRequests(args.workspace, args.repo_slug, args.state, args.limit);
                    case "createPullRequest":
                        return await this.createPullRequest(args.workspace, args.repo_slug, args.title, args.description, args.sourceBranch, args.targetBranch, args.reviewers, args.draft);
                    case "getPullRequest":
                        return await this.getPullRequest(args.workspace, args.repo_slug, args.pull_request_id);
                    case "updatePullRequest":
                        return await this.updatePullRequest(args.workspace, args.repo_slug, args.pull_request_id, args.title, args.description);
                    case "getPullRequestActivity":
                        return await this.getPullRequestActivity(args.workspace, args.repo_slug, args.pull_request_id);
                    case "approvePullRequest":
                        return await this.approvePullRequest(args.workspace, args.repo_slug, args.pull_request_id);
                    case "unapprovePullRequest":
                        return await this.unapprovePullRequest(args.workspace, args.repo_slug, args.pull_request_id);
                    case "declinePullRequest":
                        return await this.declinePullRequest(args.workspace, args.repo_slug, args.pull_request_id, args.message);
                    case "mergePullRequest":
                        return await this.mergePullRequest(args.workspace, args.repo_slug, args.pull_request_id, args.message, args.strategy);
                    case "getPullRequestComments":
                        return await this.getPullRequestComments(args.workspace, args.repo_slug, args.pull_request_id);
                    case "getPullRequestDiff":
                        return await this.getPullRequestDiff(args.workspace, args.repo_slug, args.pull_request_id);
                    case "getPullRequestCommits":
                        return await this.getPullRequestCommits(args.workspace, args.repo_slug, args.pull_request_id);
                    case "addPullRequestComment":
                        return await this.addPullRequestComment(args.workspace, args.repo_slug, args.pull_request_id, args.content, args.inline, args.pending);
                    case "addPendingPullRequestComment":
                        return await this.addPendingPullRequestComment(args.workspace, args.repo_slug, args.pull_request_id, args.content, args.inline);
                    case "publishPendingComments":
                        return await this.publishPendingComments(args.workspace, args.repo_slug, args.pull_request_id);
                    case "getRepositoryBranchingModel":
                        return await this.getRepositoryBranchingModel(args.workspace, args.repo_slug);
                    case "getRepositoryBranchingModelSettings":
                        return await this.getRepositoryBranchingModelSettings(args.workspace, args.repo_slug);
                    case "updateRepositoryBranchingModelSettings":
                        return await this.updateRepositoryBranchingModelSettings(args.workspace, args.repo_slug, args.development, args.production, args.branch_types);
                    case "getEffectiveRepositoryBranchingModel":
                        return await this.getEffectiveRepositoryBranchingModel(args.workspace, args.repo_slug);
                    case "getProjectBranchingModel":
                        return await this.getProjectBranchingModel(args.workspace, args.project_key);
                    case "getProjectBranchingModelSettings":
                        return await this.getProjectBranchingModelSettings(args.workspace, args.project_key);
                    case "updateProjectBranchingModelSettings":
                        return await this.updateProjectBranchingModelSettings(args.workspace, args.project_key, args.development, args.production, args.branch_types);
                    case "createDraftPullRequest":
                        return await this.createDraftPullRequest(args.workspace, args.repo_slug, args.title, args.description, args.sourceBranch, args.targetBranch, args.reviewers);
                    case "publishDraftPullRequest":
                        return await this.publishDraftPullRequest(args.workspace, args.repo_slug, args.pull_request_id);
                    case "convertTodraft":
                        return await this.convertTodraft(args.workspace, args.repo_slug, args.pull_request_id);
                    case "getPendingReviewPRs":
                        return await this.getPendingReviewPRs(args.workspace, args.limit, args.repositoryList);
                    case "listPipelineRuns":
                        return await this.listPipelineRuns(args.workspace, args.repo_slug, args.limit, args.status, args.target_branch, args.trigger_type);
                    case "getPipelineRun":
                        return await this.getPipelineRun(args.workspace, args.repo_slug, args.pipeline_uuid);
                    case "runPipeline":
                        return await this.runPipeline(args.workspace, args.repo_slug, args.target, args.variables);
                    case "stopPipeline":
                        return await this.stopPipeline(args.workspace, args.repo_slug, args.pipeline_uuid);
                    case "getPipelineSteps":
                        return await this.getPipelineSteps(args.workspace, args.repo_slug, args.pipeline_uuid);
                    case "getPipelineStep":
                        return await this.getPipelineStep(args.workspace, args.repo_slug, args.pipeline_uuid, args.step_uuid);
                    case "getPipelineStepLogs":
                        return await this.getPipelineStepLogs(args.workspace, args.repo_slug, args.pipeline_uuid, args.step_uuid);
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
                }
            }
            catch (error) {
                logger.error("Tool execution error", { error });
                if (axios.isAxiosError(error)) {
                    throw new McpError(ErrorCode.InternalError, `Bitbucket API error: ${error.response?.data.message ?? error.message}`);
                }
                throw error;
            }
        });
    }
    async listRepositories(workspace, limit = 10, name) {
        try {
            // Use default workspace if not provided
            const wsName = workspace || this.config.defaultWorkspace;
            if (!wsName) {
                throw new McpError(ErrorCode.InvalidParams, "Workspace must be provided either as a parameter or through BITBUCKET_WORKSPACE environment variable");
            }
            logger.info("Listing Bitbucket repositories", {
                workspace: wsName,
                limit,
                name,
            });
            // Build query parameters
            const params = { limit };
            if (name) {
                params.q = `name~"${name}"`;
            }
            const response = await this.api.get(`/repositories/${wsName}`, {
                params,
            });
            // Use the results from Bitbucket API directly
            let repositories = response.data.values;
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(repositories, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error listing repositories", { error, workspace, name });
            throw new McpError(ErrorCode.InternalError, `Failed to list repositories: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getRepository(workspace, repo_slug) {
        try {
            logger.info("Getting Bitbucket repository info", {
                workspace,
                repo_slug,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting repository", { error, workspace, repo_slug });
            throw new McpError(ErrorCode.InternalError, `Failed to get repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequests(workspace, repo_slug, state, limit = 10) {
        try {
            logger.info("Getting Bitbucket pull requests", {
                workspace,
                repo_slug,
                state,
                limit,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests`, {
                params: {
                    state: state,
                    limit,
                },
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull requests", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull requests: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createPullRequest(workspace, repo_slug, title, description, sourceBranch, targetBranch, reviewers, draft) {
        try {
            logger.info("Creating Bitbucket pull request", {
                workspace,
                repo_slug,
                title,
                sourceBranch,
                targetBranch,
            });
            // Prepare reviewers format if provided
            const reviewersArray = reviewers?.map((username) => ({
                username,
            })) || [];
            // Create the pull request
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pullrequests`, {
                title,
                description,
                source: {
                    branch: {
                        name: sourceBranch,
                    },
                },
                destination: {
                    branch: {
                        name: targetBranch,
                    },
                },
                reviewers: reviewersArray,
                close_source_branch: true,
                draft: draft === true, // Only set draft=true if explicitly specified
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error creating pull request", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to create pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequest(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Getting Bitbucket pull request details", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull request details", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull request details: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updatePullRequest(workspace, repo_slug, pull_request_id, title, description) {
        try {
            logger.info("Updating Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // Only include fields that are provided
            const updateData = {};
            if (title !== undefined)
                updateData.title = title;
            if (description !== undefined)
                updateData.description = description;
            const response = await this.api.put(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}`, updateData);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error updating pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to update pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequestActivity(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Getting Bitbucket pull request activity", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/activity`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull request activity", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull request activity: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async approvePullRequest(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Approving Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/approve`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error approving pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to approve pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async unapprovePullRequest(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Unapproving Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.delete(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/approve`);
            return {
                content: [
                    {
                        type: "text",
                        text: "Pull request approval removed successfully.",
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error unapproving pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to unapprove pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async declinePullRequest(workspace, repo_slug, pull_request_id, message) {
        try {
            logger.info("Declining Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // Include message if provided
            const data = message ? { message } : {};
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/decline`, data);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error declining pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to decline pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async mergePullRequest(workspace, repo_slug, pull_request_id, message, strategy) {
        try {
            logger.info("Merging Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
                strategy,
            });
            // Build request data
            const data = {};
            if (message)
                data.message = message;
            if (strategy)
                data.merge_strategy = strategy;
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/merge`, data);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error merging pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to merge pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequestComments(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Getting Bitbucket pull request comments", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull request comments", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull request comments: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequestDiff(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Getting Bitbucket pull request diff", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // First get the pull request details to extract commit information
            const prResponse = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}`);
            const sourceCommit = prResponse.data.source.commit.hash;
            const destinationCommit = prResponse.data.destination.commit.hash;
            // Construct the correct diff URL with the proper format
            // The format is: /repositories/{workspace}/{repo_slug}/diff/{source_repo}:{source_commit}%0D{destination_commit}?from_pullrequest_id={pr_id}&topic=true
            const diffUrl = `/repositories/${workspace}/${repo_slug}/diff/${workspace}/${repo_slug}:${sourceCommit}%0D${destinationCommit}?from_pullrequest_id=${pull_request_id}&topic=true`;
            const response = await this.api.get(diffUrl, {
                headers: {
                    Accept: "text/plain",
                },
                responseType: "text",
                maxRedirects: 5, // Enable redirect following
            });
            return {
                content: [
                    {
                        type: "text",
                        text: response.data,
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull request diff", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull request diff: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPullRequestCommits(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Getting Bitbucket pull request commits", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/commits`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pull request commits", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pull request commits: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async addPullRequestComment(workspace, repo_slug, pull_request_id, content, inline, pending) {
        try {
            logger.info("Adding comment to Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
                inline: inline ? "inline comment" : "general comment",
            });
            // Prepare the comment data
            const commentData = {
                content: {
                    raw: content,
                },
            };
            // Add pending flag if provided
            if (pending !== undefined) {
                commentData.pending = pending;
            }
            // Add inline information if provided
            if (inline) {
                commentData.inline = {
                    path: inline.path,
                };
                // Add line number information based on the type
                if (inline.from !== undefined) {
                    commentData.inline.from = inline.from;
                }
                if (inline.to !== undefined) {
                    commentData.inline.to = inline.to;
                }
            }
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments`, commentData);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error adding comment to pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to add pull request comment: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getRepositoryBranchingModel(workspace, repo_slug) {
        try {
            logger.info("Getting repository branching model", {
                workspace,
                repo_slug,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/branching-model`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting repository branching model", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get repository branching model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getRepositoryBranchingModelSettings(workspace, repo_slug) {
        try {
            logger.info("Getting repository branching model settings", {
                workspace,
                repo_slug,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/branching-model/settings`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting repository branching model settings", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get repository branching model settings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updateRepositoryBranchingModelSettings(workspace, repo_slug, development, production, branch_types) {
        try {
            logger.info("Updating repository branching model settings", {
                workspace,
                repo_slug,
                development,
                production,
                branch_types,
            });
            // Build request data with only the fields that are provided
            const updateData = {};
            if (development)
                updateData.development = development;
            if (production)
                updateData.production = production;
            if (branch_types)
                updateData.branch_types = branch_types;
            const response = await this.api.put(`/repositories/${workspace}/${repo_slug}/branching-model/settings`, updateData);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error updating repository branching model settings", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to update repository branching model settings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getEffectiveRepositoryBranchingModel(workspace, repo_slug) {
        try {
            logger.info("Getting effective repository branching model", {
                workspace,
                repo_slug,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/effective-branching-model`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting effective repository branching model", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get effective repository branching model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getProjectBranchingModel(workspace, project_key) {
        try {
            logger.info("Getting project branching model", {
                workspace,
                project_key,
            });
            const response = await this.api.get(`/workspaces/${workspace}/projects/${project_key}/branching-model`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting project branching model", {
                error,
                workspace,
                project_key,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get project branching model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getProjectBranchingModelSettings(workspace, project_key) {
        try {
            logger.info("Getting project branching model settings", {
                workspace,
                project_key,
            });
            const response = await this.api.get(`/workspaces/${workspace}/projects/${project_key}/branching-model/settings`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting project branching model settings", {
                error,
                workspace,
                project_key,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get project branching model settings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updateProjectBranchingModelSettings(workspace, project_key, development, production, branch_types) {
        try {
            logger.info("Updating project branching model settings", {
                workspace,
                project_key,
                development,
                production,
                branch_types,
            });
            // Build request data with only the fields that are provided
            const updateData = {};
            if (development)
                updateData.development = development;
            if (production)
                updateData.production = production;
            if (branch_types)
                updateData.branch_types = branch_types;
            const response = await this.api.put(`/workspaces/${workspace}/projects/${project_key}/branching-model/settings`, updateData);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error updating project branching model settings", {
                error,
                workspace,
                project_key,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to update project branching model settings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async addPendingPullRequestComment(workspace, repo_slug, pull_request_id, content, inline) {
        try {
            logger.info("Adding pending comment to Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
                inline: inline ? "inline comment" : "general comment",
            });
            // Use the existing addPullRequestComment method with pending=true
            return await this.addPullRequestComment(workspace, repo_slug, pull_request_id, content, inline, true // Set pending to true for draft comment
            );
        }
        catch (error) {
            logger.error("Error adding pending comment to pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to add pending pull request comment: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async publishPendingComments(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Publishing pending comments for Bitbucket pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // First, get all pending comments for the pull request
            const commentsResponse = await this.api.get(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments`);
            const comments = commentsResponse.data.values || [];
            const pendingComments = comments.filter((comment) => comment.pending === true);
            if (pendingComments.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No pending comments found to publish.",
                        },
                    ],
                };
            }
            // Publish each pending comment by updating it with pending=false
            const publishResults = [];
            for (const comment of pendingComments) {
                try {
                    const updateResponse = await this.api.put(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}/comments/${comment.id}`, {
                        content: comment.content,
                        pending: false,
                        ...(comment.inline && { inline: comment.inline })
                    });
                    publishResults.push({
                        commentId: comment.id,
                        status: "published",
                        data: updateResponse.data,
                    });
                }
                catch (error) {
                    publishResults.push({
                        commentId: comment.id,
                        status: "error",
                        error: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            message: `Published ${pendingComments.length} pending comments`,
                            results: publishResults,
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error publishing pending comments", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to publish pending comments: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createDraftPullRequest(workspace, repo_slug, title, description, sourceBranch, targetBranch, reviewers) {
        try {
            logger.info("Creating draft Bitbucket pull request", {
                workspace,
                repo_slug,
                title,
                sourceBranch,
                targetBranch,
            });
            // Use the existing createPullRequest method with draft=true
            return await this.createPullRequest(workspace, repo_slug, title, description, sourceBranch, targetBranch, reviewers, true // Set draft to true
            );
        }
        catch (error) {
            logger.error("Error creating draft pull request", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to create draft pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async publishDraftPullRequest(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Publishing draft pull request", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // Update the pull request to set draft=false
            const response = await this.api.put(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}`, {
                draft: false,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error publishing draft pull request", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to publish draft pull request: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async convertTodraft(workspace, repo_slug, pull_request_id) {
        try {
            logger.info("Converting pull request to draft", {
                workspace,
                repo_slug,
                pull_request_id,
            });
            // Update the pull request to set draft=true
            const response = await this.api.put(`/repositories/${workspace}/${repo_slug}/pullrequests/${pull_request_id}`, {
                draft: true,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error converting pull request to draft", {
                error,
                workspace,
                repo_slug,
                pull_request_id,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to convert pull request to draft: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPendingReviewPRs(workspace, limit = 50, repositoryList) {
        try {
            const wsName = workspace || this.config.defaultWorkspace;
            if (!wsName) {
                throw new McpError(ErrorCode.InvalidParams, "Workspace must be provided either as a parameter or through BITBUCKET_WORKSPACE environment variable");
            }
            const currentUserNickname = this.config.username;
            if (!currentUserNickname) {
                throw new McpError(ErrorCode.InvalidParams, "Username must be provided through BITBUCKET_USERNAME environment variable");
            }
            logger.info("Getting pending review PRs", {
                workspace: wsName,
                username: currentUserNickname,
                repositoryList: repositoryList?.length || "all repositories",
                limit
            });
            let repositoriesToCheck = [];
            if (repositoryList && repositoryList.length > 0) {
                // Use the provided repository list
                repositoriesToCheck = repositoryList;
                logger.info(`Checking specific repositories: ${repositoryList.join(', ')}`);
            }
            else {
                // Get all repositories in the workspace (existing behavior)
                logger.info("Getting all repositories in workspace...");
                const reposResponse = await this.api.get(`/repositories/${wsName}`, {
                    params: { pagelen: 100 }
                });
                if (!reposResponse.data.values) {
                    throw new McpError(ErrorCode.InternalError, "Failed to fetch repositories");
                }
                repositoriesToCheck = reposResponse.data.values.map((repo) => repo.name);
                logger.info(`Found ${repositoriesToCheck.length} repositories to check`);
            }
            const pendingPRs = [];
            const batchSize = 5; // Process repositories in batches to avoid overwhelming the API
            // Process repositories in batches
            for (let i = 0; i < repositoriesToCheck.length; i += batchSize) {
                const batch = repositoriesToCheck.slice(i, i + batchSize);
                // Process batch in parallel
                const batchPromises = batch.map(async (repoSlug) => {
                    try {
                        logger.info(`Checking repository: ${repoSlug}`);
                        // Get open PRs for this repository with participants expanded
                        const prsResponse = await this.api.get(`/repositories/${wsName}/${repoSlug}/pullrequests`, {
                            params: {
                                state: 'OPEN',
                                pagelen: Math.min(limit, 50), // Limit per repo to avoid too much data
                                fields: 'values.id,values.title,values.description,values.state,values.created_on,values.updated_on,values.author,values.source,values.destination,values.participants.user.nickname,values.participants.role,values.participants.approved,values.links'
                            }
                        });
                        if (!prsResponse.data.values) {
                            return [];
                        }
                        // Filter PRs where current user is a reviewer and hasn't approved
                        const reposPendingPRs = prsResponse.data.values.filter((pr) => {
                            if (!pr.participants || !Array.isArray(pr.participants)) {
                                logger.debug(`PR ${pr.id} has no participants array`);
                                return false;
                            }
                            logger.debug(`PR ${pr.id} participants:`, pr.participants.map((p) => ({
                                nickname: p.user?.nickname,
                                role: p.role,
                                approved: p.approved
                            })));
                            // Check if current user is a reviewer who hasn't approved
                            const userParticipant = pr.participants.find((participant) => participant.user?.nickname === currentUserNickname &&
                                participant.role === 'REVIEWER' &&
                                participant.approved === false);
                            logger.debug(`PR ${pr.id} - User ${currentUserNickname} is pending reviewer:`, !!userParticipant);
                            return !!userParticipant;
                        });
                        // Add repository info to each PR
                        return reposPendingPRs.map((pr) => ({
                            ...pr,
                            repository: {
                                name: repoSlug,
                                full_name: `${wsName}/${repoSlug}`
                            }
                        }));
                    }
                    catch (error) {
                        logger.error(`Error checking repository ${repoSlug}:`, error);
                        return [];
                    }
                });
                // Wait for batch to complete
                const batchResults = await Promise.all(batchPromises);
                // Flatten and add to results
                for (const repoPRs of batchResults) {
                    pendingPRs.push(...repoPRs);
                    // Stop if we've reached the limit
                    if (pendingPRs.length >= limit) {
                        break;
                    }
                }
                // Stop processing if we've reached the limit
                if (pendingPRs.length >= limit) {
                    break;
                }
            }
            // Trim to exact limit and sort by updated date
            const finalResults = pendingPRs
                .slice(0, limit)
                .sort((a, b) => new Date(b.updated_on).getTime() - new Date(a.updated_on).getTime());
            logger.info(`Found ${finalResults.length} pending review PRs`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            pending_review_prs: finalResults,
                            total_found: finalResults.length,
                            searched_repositories: repositoriesToCheck.length,
                            user: currentUserNickname,
                            workspace: wsName
                        }, null, 2)
                    }
                ]
            };
        }
        catch (error) {
            logger.error("Error getting pending review PRs:", error);
            throw new McpError(ErrorCode.InternalError, `Failed to get pending review PRs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // =========== PIPELINE METHODS ===========
    async listPipelineRuns(workspace, repo_slug, limit, status, target_branch, trigger_type) {
        try {
            logger.info("Listing pipeline runs", {
                workspace,
                repo_slug,
                limit,
                status,
                target_branch,
                trigger_type,
            });
            const params = {};
            if (limit)
                params.pagelen = limit;
            if (status)
                params.status = status;
            if (target_branch)
                params["target.branch"] = target_branch;
            if (trigger_type)
                params.trigger_type = trigger_type;
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pipelines`, { params });
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error listing pipeline runs", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to list pipeline runs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPipelineRun(workspace, repo_slug, pipeline_uuid) {
        try {
            logger.info("Getting pipeline run details", {
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pipelines/${pipeline_uuid}`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pipeline run", {
                error,
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pipeline run: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async runPipeline(workspace, repo_slug, target, variables) {
        try {
            logger.info("Triggering pipeline run", {
                workspace,
                repo_slug,
                target,
                variables: variables?.length || 0,
            });
            // Build the target object based on the input
            const pipelineTarget = {
                type: target.commit_hash ? "pipeline_commit_target" : "pipeline_ref_target",
                ref_type: target.ref_type,
                ref_name: target.ref_name,
            };
            // Add commit if specified
            if (target.commit_hash) {
                pipelineTarget.commit = {
                    type: "commit",
                    hash: target.commit_hash,
                };
            }
            // Add selector if specified
            if (target.selector_type && target.selector_pattern) {
                pipelineTarget.selector = {
                    type: target.selector_type,
                    pattern: target.selector_pattern,
                };
            }
            // Build the request data
            const requestData = {
                target: pipelineTarget,
            };
            // Add variables if provided
            if (variables && variables.length > 0) {
                requestData.variables = variables.map((variable) => ({
                    key: variable.key,
                    value: variable.value,
                    secured: variable.secured || false,
                }));
            }
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pipelines`, requestData);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error running pipeline", {
                error,
                workspace,
                repo_slug,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to run pipeline: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async stopPipeline(workspace, repo_slug, pipeline_uuid) {
        try {
            logger.info("Stopping pipeline", {
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            const response = await this.api.post(`/repositories/${workspace}/${repo_slug}/pipelines/${pipeline_uuid}/stopPipeline`);
            return {
                content: [
                    {
                        type: "text",
                        text: "Pipeline stop signal sent successfully.",
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error stopping pipeline", {
                error,
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to stop pipeline: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPipelineSteps(workspace, repo_slug, pipeline_uuid) {
        try {
            logger.info("Getting pipeline steps", {
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pipelines/${pipeline_uuid}/steps`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data.values, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pipeline steps", {
                error,
                workspace,
                repo_slug,
                pipeline_uuid,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pipeline steps: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPipelineStep(workspace, repo_slug, pipeline_uuid, step_uuid) {
        try {
            logger.info("Getting pipeline step details", {
                workspace,
                repo_slug,
                pipeline_uuid,
                step_uuid,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pipelines/${pipeline_uuid}/steps/${step_uuid}`);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(response.data, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pipeline step", {
                error,
                workspace,
                repo_slug,
                pipeline_uuid,
                step_uuid,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pipeline step: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getPipelineStepLogs(workspace, repo_slug, pipeline_uuid, step_uuid) {
        try {
            logger.info("Getting pipeline step logs", {
                workspace,
                repo_slug,
                pipeline_uuid,
                step_uuid,
            });
            const response = await this.api.get(`/repositories/${workspace}/${repo_slug}/pipelines/${pipeline_uuid}/steps/${step_uuid}/log`, {
                maxRedirects: 5, // Follow redirects to S3
                responseType: "text",
            });
            return {
                content: [
                    {
                        type: "text",
                        text: response.data,
                    },
                ],
            };
        }
        catch (error) {
            logger.error("Error getting pipeline step logs", {
                error,
                workspace,
                repo_slug,
                pipeline_uuid,
                step_uuid,
            });
            throw new McpError(ErrorCode.InternalError, `Failed to get pipeline step logs: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        logger.info("Bitbucket MCP server running on stdio");
    }
}
// Create and start the server
const server = new BitbucketServer();
server.run().catch((error) => {
    logger.error("Server error", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map
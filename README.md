# MCP Agent Demo

验证 **MCP（Model Context Protocol）** 服务端与 LangChain 客户端联调的最小 demo —— 让 AI Agent 跨进程调用工具、读取资源。

MCP 解决的问题是：**工具不该写死在 Agent 里**。把工具能力封装成独立进程的 MCP Server，Agent 作为 Client 通过标准协议发现和调用，两边可以分别开发、分别部署。

## 这个 demo 验证了什么

| 能力 | 实现方式 |
|---|---|
| 工具注册与调用 | `registerTool("query_user")` + Zod 约束 `inputSchema` |
| 只读资源暴露 | `registerResource("docs://guide")`，Agent 可当上下文读入 |
| 跨进程通信 | `StdioServerTransport`，Server 跑在独立子进程 |
| 客户端统一管理 | `MultiServerMCPClient` 管子进程生命周期，`getTools()` 直接转成 Agent 可用工具 |
| 资源动态读取 | `listResources()` 遍历 + `readResource()` 逐个取内容 |

## 目录结构

```
src/
├── my-mcp-server.mjs        # MCP Server：注册 query_user 工具 + docs://guide 资源
└── langchain-mcp-test.mjs   # LangChain Client：连 Server、取工具、读资源、跑 ReAct 循环
```

**`my-mcp-server.mjs`** 用 `McpServer` 起服务，数据源是内存里的假数据（注释里留了「未来可以走数据库」）：

```js
server.registerTool("query_user", {
  description: "查询数据库中的用户信息。输入用户ID，返回该用户的详细信息（姓名、邮箱、角色）",
  inputSchema: { userId: z.string().describe("用户ID, 例如：001, 002, 003") },
}, async ({ userId }) => { /* ... */ })
```

**`langchain-mcp-test.mjs`** 通过 `MultiServerMCPClient` 连上去，把 MCP 工具转成 LangChain 的 `bindTools` 格式，然后手写一个 ReAct 循环跑：

```js
const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);
```

## 运行

```bash
pnpm install
copy .env.example .env      # 填入 DEEPSEEK_API_KEY
pnpm start
```

默认脚本会问「MCP Server 的使用指南是？」，走的是**读资源**那条路径。想测工具调用，把入口那行改成：

```js
await runAgentWithTools("查一下用户002的信息");
```

## 踩过的两个坑

**1. MCP Server 子进程不回收，脚本挂住不退出**

`MultiServerMCPClient` 会 spawn 一个 Node 子进程跑 MCP Server，链路是「主进程 ←stdio→ 子进程」。如果不在末尾显式关闭，脚本跑完之后进程一直挂着。

解决：流程结束时调 `await mcpClient.close()`，把通信通道和子进程一起关掉。

**2. 工具调用的结果必须回填成 `ToolMessage`**

模型返回的 `tool_calls` 只是「想调什么」，真正执行完必须把结果包成 `ToolMessage`（带对应的 `tool_call_id`）塞回 messages 数组，模型下一轮才看得到结果。少了这一步 Agent 永远在重复调同一个工具。

## 说明

这是协议联调 demo，**MCP Server 本身没做鉴权**。stdio 传输天然隔离在本地进程所以相对安全；如果换成 SSE / HTTP 传输，鉴权和资源权限控制必须自己补。

命令执行类工具在生产环境需要在受控目录、权限隔离和沙箱中运行。

## 相关文章

仓库里的 `MCP协议实战：让AI Agent跨进程调用工具的正确姿势.md` 是这个 demo 的完整拆解。

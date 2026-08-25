  # MCP协议实战：让AI Agent跨进程调用工具的正确姿势

## 开篇：AI Agent的工具困境

想象一下这个场景：你正在搭建一个AI Agent系统，LLM大模型负责推理决策，一切都很美好。直到有一天，你想让Agent调用一个用Python写的数据处理脚本，或者一个用Java写的企业级API服务。

"等等，我的Agent是Node.js写的啊！"你挠着头说。

再想象另一个场景：你写了一个非常好用的工具函数，想在多个Agent项目中复用。结果发现每个项目都要copy一遍代码，改得面目全非。

"能不能让工具独立出来，谁想用就用？"你开始思考。

这就是很多AI开发者都会遇到的"工具困境"：

1. **工具与LLM强耦合**：工具代码必须和Agent代码在同一个进程里，难以复用
2. **跨语言调用困难**：Node.js的Agent怎么调用Python/Rust/Java写的工具？
3. **通信方式混乱**：有的用HTTP，有的用进程间通信，没有统一标准

就在这时，MCP协议出现了——它就像一座桥梁，让AI Agent能够优雅地跨越进程边界，调用任何语言写的工具。

---

## MCP协议到底是什么？

### 定义：Model Context Protocol

MCP的全称是**Model Context Protocol**，翻译过来就是"模型上下文协议"。从名字就能看出它的核心使命：**给AI模型扩展上下文（Context）**，让模型能做的更多、知道的更多。

但它不是简单的API调用。Fetch调用是拿数据，而MCP调用是**扩展能力**。这是本质区别。

### 核心特点

MCP最大的特点就是**跨进程调用**。具体来说：

- **本地跨进程**：通过stdio（标准输入输出流）实现进程间通信。想象一下，一个进程（Agent）启动另一个子进程（工具），它们之间通过键盘输入和控制台输出来对话。
- **远程跨进程**：通过HTTP实现远程通信。MCP协议负责管理HTTP服务器，客户端通过HTTP请求调用工具。

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Agent (Host)                        │
│                      (MCP Client)                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│   Stdio 传输    │             │   HTTP 传输     │
│ (本地跨进程)    │             │ (远程跨进程)    │
└────────┬────────┘             └────────┬────────┘
         │                               │
         ▼                               ▼
┌─────────────────┐             ┌─────────────────┐
│ MCP Server A    │             │ MCP Server B    │
│ (Node.js)       │             │ (Python/Java)   │
└─────────────────┘             └─────────────────┘
```

### 架构模式

MCP采用经典的**客户端-服务器模式**：

1. **MCP Server**：工具提供者，注册并暴露工具供外部调用
2. **MCP Client**：工具使用者，连接到Server并调用工具
3. **Transport**：传输层，负责协议通信（stdio或HTTP）

AI Agent作为MCP客户端（Host），可以配置多个MCP Server，实现灵活的工具调用。

---

## 实战：从零搭建MCP Server

理论讲完了，现在动手实践。我们来搭建一个完整的MCP Server，实现用户查询功能。

### 项目初始化

首先创建项目并安装依赖：

```bash
mkdir mcp-demo && cd mcp-demo
pnpm init -y
pnpm add @modelcontextprotocol/sdk zod dotenv
```

关键依赖说明：
- `@modelcontextprotocol/sdk`：MCP协议的核心SDK
- `zod`：用于参数验证的TypeScript-first schema声明库
- `dotenv`：环境变量管理

### McpServer核心API解析

创建服务器的第一步是实例化`McpServer`：

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({
  name: 'my-mcp-server',
  version: '1.0.0'
});
```

这里有两个关键参数：
- `name`：服务器名称，客户端通过这个名称识别服务器
- `version`：版本号，用于版本管理和兼容性控制

### 工具注册与参数验证

注册工具是MCP Server的核心功能。我们来注册一个`query_user`工具：

```javascript
server.tool(
  'query_user',
  '查询数据库中的用户信息。输入用户ID, 返回该用户的详细信息（姓名、邮箱、角色）',
  {
    userId: z.string().describe('用户ID, 例如：001, 002, 003')
  },
  async ({ userId }) => {
    // 工具实现逻辑
  }
);
```

`tool`方法接收四个参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `name` | string | 工具名称，必须唯一 |
| `description` | string | 工具描述，LLM通过描述理解工具用途 |
| `parameters` | object | 参数定义，使用zod schema验证 |
| `handler` | function | 工具实现函数，接收参数并返回结果 |

### 假数据模拟数据库

为了演示，我们用对象模拟数据库：

```javascript
const database = {
  users: {
    '001': { id: '001', name: '祖豪', email: 'zh@qq.com', role: 'admin' },
    '002': { id: '002', name: '光光', email: 'gg@qq.com', role: 'user' },
    '003': { id: '003', name: '小红', email: 'xh@qq.com', role: 'user' },
  }
};
```

这是一个典型的键值存储结构，通过userId快速查找用户。

### 完整的工具实现

把所有部分组合起来，完整的工具实现如下：

```javascript
server.tool(
  'query_user',
  '查询数据库中的用户信息。输入用户ID, 返回该用户的详细信息（姓名、邮箱、角色）',
  {
    userId: z.string().describe('用户ID, 例如：001, 002, 003')
  },
  async ({ userId }) => {
    const user = database.users[userId];
    if (!user) {
      return {
        content: [
          { type: 'text', text: `用户 ID ${userId} 不存在。可用的ID: 001, 002, 003` }
        ]
      };
    }
    return {
      content: [
        { 
          type: 'text', 
          text: `用户 ${user.id} 的信息是：姓名：${user.name}, 邮箱：${user.email}, 角色：${user.role}` 
        }
      ]
    };
  }
);
```

### 启动服务器

最后选择传输方式并启动：

```javascript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const transport = new StdioServerTransport();
await server.connect(transport);
```

这样，一个完整的MCP Server就搭建好了！

---

## 工具定义的艺术

工具定义看起来简单，但里面大有学问。一个好的工具定义能让LLM更准确地调用它。

### 参数验证的重要性

使用zod进行参数验证有几个好处：

1. **类型安全**：确保传入的参数类型正确
2. **自动文档**：`describe`方法提供的描述会被LLM读取
3. **错误提示**：参数不符合schema时会自动报错

```javascript
{
  userId: z.string().describe('用户ID, 例如：001, 002, 003')
}
```

这里`z.string()`确保userId必须是字符串类型，`describe`方法给LLM提供使用示例。

### 返回格式规范

工具返回值必须遵循MCP协议规定的格式：

```javascript
return {
  content: [
    { type: 'text', text: '返回内容' }
  ]
};
```

`content`是一个数组，可以包含多种类型的内容：
- `text`：纯文本
- `image_url`：图片URL
- `file`：文件引用

这种设计让工具可以返回丰富的内容格式。

### 错误处理策略

当用户不存在时，我们返回友好的错误提示：

```javascript
if (!user) {
  return {
    content: [
      { type: 'text', text: `用户 ID ${userId} 不存在。可用的ID: 001, 002, 003` }
    ]
  };
}
```

这里的关键是**不要抛出异常**，而是返回结构化的错误信息。这样LLM能理解错误原因，并可能尝试其他ID。

---

## 客户端集成：LangChain调用MCP工具

有了Server，接下来就是客户端调用。我们使用LangChain来集成MCP工具。

### 安装依赖

```bash
pnpm add @langchain/mcp-adapters @langchain/openai @langchain/core chalk
```

### MultiServerMCPClient配置

创建MCP客户端，连接到我们的服务器：

```javascript
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "my-mcp-server": {
      command: "node",
      args: ["src/my-mcp-server.mjs"],
    },
  },
});
```

`MultiServerMCPClient`支持配置多个MCP Server，每个Server通过名称标识。这里我们配置了一个名为`my-mcp-server`的服务器，使用`node`命令启动。

### 获取工具并绑定到模型

```javascript
const tools = await mcpClient.getTools();
const modelWithTools = model.bindTools(tools);
```

这段代码做了两件事：
1. `getTools()`：从MCP Server获取所有注册的工具
2. `bindTools()`：将工具绑定到LLM模型，让模型知道可以调用这些工具

### 完整的调用流程

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   LangChain      │ →  │   MCP Client     │ →  │   MCP Server     │
│   (Agent)        │    │                  │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
        │                      │                      │
        │  1. 获取工具列表      │                      │
        │ ←────────────────────┘                      │
        │                      │  2. 调用工具         │
        │                      │ →────────────────────┘
        │                      │                      │
        │                      │  3. 返回结果         │
        │                      │ ←────────────────────┘
        │  4. 处理结果         │                      │
        ←──────────────────────┘                      │
```

### 构建完整的Agent

虽然示例代码中的`runAgentWithTools`函数是空的，但我们可以补全它：

```javascript
async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [new HumanMessage(query)];
  
  for (let i = 0; i < maxIterations; i++) {
    const response = await modelWithTools.invoke(messages);
    messages.push(response);
    
    if (response.tool_calls?.length) {
      for (const toolCall of response.tool_calls) {
        const toolResult = await tools[toolCall.name].invoke(toolCall.args);
        messages.push(new ToolMessage(toolResult, { toolCallId: toolCall.id }));
      }
    } else {
      return response.content;
    }
  }
  
  throw new Error('达到最大迭代次数');
}
```

这个函数实现了典型的Agent循环：
1. 发送用户消息给模型
2. 如果模型决定调用工具，则执行工具调用
3. 将工具结果返回给模型
4. 重复直到模型给出最终回答

---

## 踩坑指南与最佳实践

在实际使用中，你可能会遇到一些坑。这里总结了几个常见问题和解决方案。

### 路径配置问题

示例代码中有一个明显的错误：

```javascript
args: ["d:\\workspace\\zjm-ai\\ai\\agent_in_action\\mcp-demo\\srrc\\langchain-mcp-test.mjs"]
```

路径中有两个问题：
1. `srrc`应该是`src`（拼写错误）
2. 使用了硬编码的绝对路径，不便于移植

**最佳实践**：使用相对路径或动态路径

```javascript
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

args: [join(__dirname, 'my-mcp-server.mjs')]
```

### 传输方式选择

**stdio vs HTTP**：

| 场景 | 推荐传输方式 | 原因 |
|------|-------------|------|
| 本地工具调用 | stdio | 启动快，延迟低 |
| 远程工具调用 | HTTP | 需要网络传输 |
| 需要调试 | HTTP | 可以通过HTTP请求调试 |
| 生产环境 | HTTP | 更稳定，支持多客户端 |

### 错误处理策略

在MCP协议中，错误处理有两种方式：

1. **结构化错误返回**（推荐）：返回包含错误信息的结构化数据
2. **抛出异常**：直接抛出异常，由传输层处理

推荐使用结构化错误返回，因为：
- LLM可以理解错误信息
- 便于调试和日志记录
- 不会导致进程崩溃

### 工具描述的编写技巧

工具描述是LLM能否正确调用工具的关键。编写时注意：

1. **清晰明确**：一句话说清楚工具的用途
2. **包含示例**：给出参数使用示例
3. **说明返回值**：告诉LLM返回什么格式的数据
4. **避免歧义**：不要使用模糊的表述

---

## 总结：MCP的未来

MCP协议不仅仅是一个工具调用协议，它代表了AI Agent架构的一种演进方向——**工具即服务**。

想象一下未来的AI开发场景：

- 你可以在市场上购买各种"工具服务"，就像安装npm包一样简单
- 工具可以用任何语言编写，只要遵循MCP协议
- 工具可以独立部署和升级，不影响Agent系统
- 多个Agent可以共享同一个工具服务

这就是MCP协议带来的变革：**让工具真正独立于LLM，实现跨进程、跨语言的灵活调用**。

如果你正在构建复杂的AI Agent系统，或者遇到了工具复用和跨语言调用的问题，MCP协议值得你深入研究。

---

**最后一个问题**：如果让你设计一个MCP工具，你会做什么？是数据处理、API调用，还是某种创造性的工具？欢迎在评论区留言讨论。
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
// agent 配置 mcp client ? 可以配置多个mcp server的client
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import chalk from "chalk";
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { z } from "zod";

const mcpClient = new MultiServerMCPClient({
  mcpServers: {
    "my-mcp-server": {
      command: "node",
      args: [
        path.join(path.dirname(fileURLToPath(import.meta.url)), "my-mcp-server.mjs"),
      ],
    },
  },
});

const model = new ChatOpenAI({
  modelName: "deepseek-v4-flash",
  apiKey: process.env.DEEPSEEK_API_KEY,
  configuration: {
    baseURL: "https://api.deepseek.com/v1",
  },
});
// 从 MCP client 获取工具
const tools = await mcpClient.getTools();
const res = await mcpClient.listResources();
let resourceContent = "";
for (const [serverName, resources] of Object.entries(res)) {
  for(const resource of resources){
    const content = await mcpClient.readResource(
      serverName,resource.uri
    )
    resourceContent += content[0].text;

  }
}
console.log(resourceContent, ".......");
const modelWithTools = model.bindTools(tools);

async function runAgentWithTools(query, maxIterations = 30) {
  const messages = [
    new SystemMessage(resourceContent),
    new HumanMessage(query)
  ];
  for (let i = 0; i < maxIterations; i++) {
    console.log(chalk.bgGreen(`正在等待AI思考, 第 ${i + 1} 轮....`));
    const response = await modelWithTools.invoke(messages);
    messages.push(response);

    if (!response.tool_calls || response.tool_calls.length === 0) {
      console.log(`\n AI 最终回复: ${response.content}`);
      return response.content;
    }

    console.log(
      chalk.bgBlue.bgBlue(`检测到
            ${response.tool_calls.length}个工具调用`),
    );
    console.log(
      chalk.bgBlue(`工具调用:
            ${response.tool_calls.map((t) => t.name).join(", ")}`),
    );

    for (const toolcall of response.tool_calls) {
      // find 方法 遍历数组 匹配条件成立后立即返回第一个符合项 后续元素不再遍历
      // Promise.all  只要一个失败，不会等待剩下结果
      // 已经发起的异步任务会继续执行
      const foundTool = tools.find((t) => t.name === toolcall.name);
      if (foundTool) {
        const toolResult = await foundTool.invoke(toolcall.args);
        // 返回的是纯文本。tool 的返回是由上下文
        messages.push(
          new ToolMessage({
            content: toolResult,
            tool_call_id: toolcall.id,
          }),
        );
      }
    }
  }
  // 循环次数 (轮数) 达到30次，仍无法恢复问题，返回最后一轮
  return messages[messages.length - 1].content;
}

// await runAgentWithTools("查一下用户002的信息");
await runAgentWithTools("MCP Server的使用指南是？");

// 关闭所有mcp子进程 与通信的通道，释放进程资源
// 关闭mcp Server的通信通道
// my-mcp-server.js 被启动了，手动关闭进程
// 释放相关资源，避免脚本一直挂着不退出
// node langchain-mcp-test.mjs 启动进程  
// 启动一个子进程 child_process
// 子进程连接 my-mcp-server.js 
// 主进程通过stdio 和他们通话
// close() 把这个链接和子进程一起关掉
await mcpClient.close();

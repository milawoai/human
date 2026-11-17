# Server Interfaces

本地 Express server 支持的接口清单维护在：

```txt
src/main/server/serverInterfaces.json
```

Pet 设置页的“服务接口”tab 会通过 IPC 从 main 进程读取这份 JSON。以后新增、删除或修改 server 接口时，需要同步更新这个 JSON。

## 维护规则

1. 新增接口后，在 `src/main/server/serverInterfaces.json` 对应 `groups[].routes` 中新增一项。
2. 修改接口方法、路径、请求体或响应结构后，同步修改对应 route。
3. 删除接口后，从 JSON 中删除对应 route。
4. `path` 必须包含完整 server 路径，例如 `/common/hello`、`/live2d/pet-models`。
5. `method` 使用大写 HTTP method，例如 `GET`、`POST`、`PATCH`。
6. `description` 写用户能理解的用途，不写实现细节。

## 字段说明

```json
{
  "method": "GET",
  "path": "/live2d/pet-models",
  "description": "获取 Pet 可用 Live2D 模型配置。",
  "requestBody": null,
  "response": "{ success: boolean, data: ... }"
}
```

- `method`: HTTP 方法。
- `path`: 完整接口路径。
- `description`: 接口用途。
- `requestBody`: 请求体说明。没有请求体时填 `null`。
- `response`: 响应结构说明。

## 当前接口来源

- `/heart-beat`: `src/main/server/index.ts`
- `/common/*`: `src/main/server/routes/common.ts`
- `/live2d/*`: `src/main/server/routes/live2d.ts`
- `/mcp/*`: `src/main/server/routes/mcp.ts`

## Live2D 控制接口实现约定

Live2D 的核心控制逻辑放在：

```txt
src/main/services/live2d/index.ts
```

`src/main/server/routes/live2d.ts` 只负责 HTTP 参数校验和响应包装。这样同一套 Live2D 控制能力既可以被 server route 调用，也可以通过 IPC 暴露给 renderer 调用。

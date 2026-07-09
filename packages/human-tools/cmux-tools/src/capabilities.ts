/**
 * @human/cmux-tools — 能力分发
 *
 * 将 cmux tool 的语义化 capability 映射到 cmux 命令。
 * 分为三类：
 * - execute：万能透传（兜底）
 * - check_health：自检
 * - 场景化：workspace.* / agent.* / notify / current_workspace
 *
 * 场景化能力内部最终都调 client.call(command, params)，
 * 由 client 决定走 CLI 还是 socket（agent.read_screen 强制 socket）。
 */
import { CmuxClient } from './client';
import {
  ToolResult,
  ToolContext,
  TransportHint,
  CmuxErrorCodes,
} from './types';

/** 必填参数校验 */
function requireParams(
  params: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const k of keys) {
    if (params[k] == null || params[k] === '') {
      return `缺少必填参数: ${k}`;
    }
  }
  return null;
}

/** 把 client.call 结果转成 ToolResult */
function toToolResult(
  r: Awaited<ReturnType<CmuxClient['call']>>,
): ToolResult {
  if (r.ok) return { success: true, data: r.data };
  return { success: false, error: { code: r.error?.code ?? CmuxErrorCodes.EXECUTION_ERROR, message: r.error?.message ?? 'unknown' } };
}

/**
 * 能力分发主函数。
 * 由 CmuxToolInstance.execute 调用（执行前已做 quickGate 门禁）。
 */
export async function dispatchCapability(
  capability: string,
  params: Record<string, unknown>,
  context: ToolContext,
  client: CmuxClient,
): Promise<ToolResult> {
  switch (capability) {
    // ────────────── 万能透传 ──────────────
    case 'execute':
      return runExecute(params, client);

    // ────────────── 自检 ──────────────
    case 'check_health':
      return runCheckHealth(client);

    // ────────────── workspace ──────────────
    case 'workspace.list':
      return toToolResult(await client.call('workspace.list', {}, { transport: 'auto' }));
    case 'workspace.create': {
      const p: Record<string, unknown> = {};
      if (params.name != null) p.name = params.name;
      if (params.cwd != null) p.cwd = params.cwd;
      return toToolResult(await client.call('workspace.create', p, { transport: 'cli' }));
    }
    case 'workspace.close': {
      const err = requireParams(params, ['ref']);
      if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };
      return toToolResult(await client.call('workspace.close', { workspace: params.ref }, { transport: 'cli' }));
    }
    case 'workspace.select': {
      const err = requireParams(params, ['ref']);
      if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };
      return toToolResult(await client.call('workspace.select', { workspace: params.ref }, { transport: 'cli' }));
    }

    // ────────────── agent 控制 ──────────────
    case 'agent.send': {
      const err = requireParams(params, ['text']);
      if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };
      const p: Record<string, unknown> = { text: params.text };
      if (params.surface != null) p.surface = params.surface;
      if (params.workspace != null) p.workspace = params.workspace;
      // send 倾向 socket（在 SOCKET_PREFERRED 中），失败降级 CLI
      return toToolResult(await client.call('send', p, { transport: 'auto' }));
    }
    case 'agent.send_key': {
      const err = requireParams(params, ['key']);
      if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };
      const p: Record<string, unknown> = { key: params.key };
      if (params.surface != null) p.surface = params.surface;
      return toToolResult(await client.call('send-key', p, { transport: 'auto' }));
    }
    case 'agent.read_screen': {
      // 强制 socket：大返回，低延迟
      const p: Record<string, unknown> = {};
      if (params.surface != null) p.surface = params.surface;
      if (params.lines != null) p.lines = params.lines;
      if (params.scrollback === true) p.scrollback = true;
      return toToolResult(await client.call('read-screen', p, { transport: 'socket' as TransportHint }));
    }
    case 'agent.identify':
      return toToolResult(await client.call('identify', {}, { transport: 'auto' }));
    case 'agent.list_surfaces': {
      // cmux 的 surface.list 只返回【当前 workspace】的 surface（实测确认，传 workspace 参数无效）。
      // 要跨 workspace 列 surface，需 workspace.select 切换后再 list。
      // 本能力根据参数决定行为：
      //   - 不传 workspace → 遍历所有 workspace，合并返回（每个 surface 带 workspaceRef）
      //   - 传 workspace   → 只列该 workspace（select 切过去再 list）
      const targetWorkspace = params.workspace as string | undefined;
      return listSurfacesAcrossWorkspaces(client, targetWorkspace);
    }

    // ────────────── 通知 / 查询 ──────────────
    case 'notify': {
      const err = requireParams(params, ['title']);
      if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };
      const p: Record<string, unknown> = { title: params.title };
      if (params.body != null) p.body = params.body;
      return toToolResult(await client.call('notify', p, { transport: 'cli' }));
    }
    case 'current_workspace':
      return toToolResult(await client.call('current-workspace', {}, { transport: 'auto' }));

    default:
      return {
        success: false,
        error: {
          code: CmuxErrorCodes.CAPABILITY_NOT_FOUND,
          message: `cmux 未找到能力: ${capability}`,
        },
      };
  }
}

/** 万能 execute：透传任意 cmux 命令 */
async function runExecute(params: Record<string, unknown>, client: CmuxClient): Promise<ToolResult> {
  const err = requireParams(params, ['method']);
  if (err) return { success: false, error: { code: 'PARAMETER_VALIDATION_ERROR', message: err } };

  const command = String(params.method);
  // socket 模式参数对象
  const callParams = (params.params as Record<string, unknown>) || {};
  const transport = (params.transport as TransportHint) || 'auto';
  const expectJson = params.json === undefined ? undefined : Boolean(params.json);

  // 若调用方给了 args（CLI 参数数组），优先按 CLI 透传
  if (Array.isArray(params.args)) {
    // 直接拼成 CLI args，不走 commandToCliArgs
    const args = (params.args as unknown[]).map(String);
    if (expectJson !== false) args.push('--json');
    try {
      const r = await client.cliExec(args);
      if (r.exitCode !== 0) {
        return {
          success: false,
          error: {
            code: CmuxErrorCodes.CLI_ERROR,
            message: r.stderr.trim() || `exit ${r.exitCode}`,
            details: r,
          },
        };
      }
      const text = r.stdout.trim();
      try {
        return { success: true, data: JSON.parse(text) };
      } catch {
        return { success: true, data: text };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          code: CmuxErrorCodes.CLI_ERROR,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  return toToolResult(await client.call(command, callParams, { transport, expectJson }));
}

/** check_health：强制刷新并返回结构化诊断（永远 success:true） */
async function runCheckHealth(client: CmuxClient): Promise<ToolResult> {
  const state = await client.probeHealth(true);
  return { success: true, data: state };
}

/** 把 cmux 原始 surface 对象转为对外统一结构 */
function mapSurface(
  sf: Record<string, unknown>,
  workspaceRef?: string,
  workspaceId?: string,
): Record<string, unknown> {
  return {
    ref: sf.ref ?? sf.id,
    /** surface 的 uuid —— cmux 事件流(notification.created 等)用这个标识 surface */
    id: sf.id,
    title: sf.title ?? '',
    type: sf.type ?? 'terminal',
    workspaceRef: workspaceRef ?? sf.workspace_ref,
    workspaceId: workspaceId ?? sf.workspace_id,
    paneRef: sf.pane_ref,
    paneId: sf.pane_id,
    focused: sf.focused === true,
    workingDirectory: sf.requested_working_directory ?? sf.working_directory,
  };
}

/**
 * 跨 workspace 列 surface。
 *
 * cmux 的 surface.list 只返回当前 workspace 的 surface（实测确认）。
 * 本函数通过 workspace.select 切换实现跨 workspace：
 *   - targetWorkspace 给定：只列该 workspace
 *   - targetWorkspace 省略：遍历所有 workspace 合并返回
 * 无论结果如何，最后切回原 workspace（避免副作用）。
 */
async function listSurfacesAcrossWorkspaces(
  client: CmuxClient,
  targetWorkspace?: string,
): Promise<ToolResult> {
  // 全程走 socket：不影响 cmux UI 焦点（CLI select 会切换用户可见 workspace）。
  // 1. 记住原 workspace（workspace.current 返回 workspace_ref）
  const curRes = await client.call('current-workspace', {}, { transport: 'socket' });
  const originalRef = (curRes.data as { workspace_ref?: string })?.workspace_ref;

  try {
    // 2. 确定要遍历的 workspace 列表
    let workspaces: Array<{ ref: string; id?: string; title?: string }>;
    if (targetWorkspace) {
      workspaces = [{ ref: targetWorkspace }];
    } else {
      const listRes = await client.call('workspace.list', {}, { transport: 'socket' });
      const arr = (listRes.data as { workspaces?: unknown[] })?.workspaces ?? [];
      workspaces = (Array.isArray(arr) ? arr : []).map((w) => {
        const ws = w as Record<string, unknown>;
        return { ref: String(ws.ref), id: ws.id as string | undefined, title: ws.title as string | undefined };
      });
    }

    // 3. 逐个 workspace：socket select(workspace_id) → list surfaces
    const all: Record<string, unknown>[] = [];
    for (const ws of workspaces) {
      const selRes = await client.call('workspace.select', { workspace_id: ws.ref }, { transport: 'socket' });
      if (!selRes.ok) continue;
      const listRes = await client.call('list-surfaces', {}, { transport: 'socket' });
      if (!listRes.ok) continue;
      const raw = (listRes.data as { surfaces?: unknown[] })?.surfaces ?? [];
      const surfaces = Array.isArray(raw) ? raw : [];
      for (const s of surfaces) {
        all.push(mapSurface(s as Record<string, unknown>, ws.ref, ws.id));
      }
    }

    return { success: true, data: { surfaces: all, count: all.length } };
  } finally {
    // 4. 切回原 workspace（socket，避免改变用户聚焦）
    if (originalRef) {
      await client
        .call('workspace.select', { workspace_id: originalRef }, { transport: 'socket' })
        .catch(() => {});
    }
  }
}

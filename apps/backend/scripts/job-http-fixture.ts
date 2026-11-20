import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JobsModule } from '../src/motor/jobs/jobs.module';
import { PiWorkspaceWorkerService } from '../src/brain/agent/worker/pi-workspace-worker.service';
import { LlmService } from '../src/brain/language-center/llm.service';
import { ModelConfigService } from '../src/brain/language-center/model-config.service';
import { ProviderAuthService } from '../src/brain/language-center/provider-auth.service';
import { fixtureJobLlm } from './job-pi-fixture';
import { registerForegroundFixture } from './job-front-fixture';

@Module({}) class TestDatabase {}
@Module({}) class TestRoot {}

export async function jobHttpFixture(real = false, persistedDirectory?: string) {
  const directory = persistedDirectory ?? realpathSync(mkdtempSync(join(tmpdir(), 'human-job-http-')));
  const workspace = join(directory, 'workspace'); mkdirSync(workspace, { recursive: true });
  if (!existsSync(join(workspace, 'public.txt'))) writeFileSync(join(workspace, 'public.txt'), 'Public workspace fixture. No secrets.\n');
  const alternateWorkspace = join(directory, 'alternate-workspace'); mkdirSync(alternateWorkspace, { recursive: true });
  writeFileSync(join(alternateWorkspace, 'alternate-only.txt'), 'Alternate authorized workspace fixture.\n');
  const grantsPath = join(directory, 'job-workspaces.json');
  writeFileSync(grantsPath, JSON.stringify({ version: 1, defaultWorkspaceId: 'fixture-workspace',
    workspaces: [{ id: 'fixture-workspace', path: realpathSync(workspace), label: 'Fixture' },
      { id: 'alternate-workspace', path: realpathSync(alternateWorkspace), label: 'Alternate fixture' }] }));
  const previousGrantsPath = process.env.HUMAN_JOB_WORKSPACES_FILE;
  process.env.HUMAN_JOB_WORKSPACES_FILE = grantsPath;
  const source = new DataSource({ type: 'better-sqlite3', database: join(directory, 'motor.db') });
  let app: Awaited<ReturnType<typeof NestFactory.create>> | undefined;
  try {
    await source.initialize();
    const llm = await fixtureJobLlm();
    app = await NestFactory.create({ module: TestRoot, imports: [
      { module: TestDatabase, global: true, providers: [{ provide: DataSource, useValue: source }], exports: [DataSource] }, JobsModule,
    ], providers: [PiWorkspaceWorkerService, ...(real ? [LlmService, ModelConfigService, ProviderAuthService] : [
      { provide: LlmService, useValue: llm }, { provide: ProviderAuthService, useValue: { resolveApiKey: async () => undefined } },
    ])] }, { logger: false, abortOnError: false });
    await app.listen(0, '127.0.0.1');
    if (!real) registerForegroundFixture(app, llm);
    const baseUrl = await app.getUrl();
    const trigger = async (topic: string, payload: unknown, kind = topic.endsWith('.get') || topic.endsWith('.result') ? 'query' : 'command') => {
      const response = await fetch(`${baseUrl}/neural/trigger`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, topic, payload }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<any>;
    };
    return { app, directory, workspace, alternateWorkspace, source, trigger, baseUrl, requests: llm.requests, release: llm.release,
      async close() {
        try { await app!.close(); } finally {
          if (source.isInitialized) await source.destroy();
          if (previousGrantsPath === undefined) delete process.env.HUMAN_JOB_WORKSPACES_FILE;
          else process.env.HUMAN_JOB_WORKSPACES_FILE = previousGrantsPath;
          rmSync(directory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    if (app) await app.close();
    if (source.isInitialized) await source.destroy();
    if (previousGrantsPath === undefined) delete process.env.HUMAN_JOB_WORKSPACES_FILE; else process.env.HUMAN_JOB_WORKSPACES_FILE = previousGrantsPath;
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function pollJob(f: Awaited<ReturnType<typeof jobHttpFixture>>, jobId: string, until: (state: string) => boolean, limitMs = 5000) {
  const end = Date.now() + limitMs;
  while (Date.now() < end) {
    const response = await f.trigger('motor.job.get', { jobId });
    if (!response.success) throw new Error(JSON.stringify(response));
    if (until(response.data.state)) return response.data;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Job ${jobId} did not reach expected state`);
}

// История изменений + откат.
//
// GET  /api/admin/history          → список последних ~30 CMS-коммитов
// POST /api/admin/history {sha}    → откатить указанный коммит

import type { APIRoute } from 'astro';

export const prerender = false;

interface GitHubContext {
  token: string;
  owner: string;
  repo: string;
  branch: string;
}

function getCtx(locals: any): GitHubContext | null {
  const env = (locals as any)?.runtime?.env ?? {};
  const token = env.GITHUB_TOKEN as string | undefined;
  if (!token) return null;
  return {
    token,
    owner: (env.GITHUB_OWNER as string | undefined) || 'zubarevdm',
    repo: (env.GITHUB_REPO as string | undefined) || 'typemoscow',
    branch: (env.GITHUB_BRANCH as string | undefined) || 'main',
  };
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'type-moscow-cms',
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — список CMS-коммитов

export const GET: APIRoute = async ({ locals }) => {
  const ctx = getCtx(locals);
  if (!ctx) return jsonRes({ error: 'GITHUB_TOKEN not configured' }, 500);

  try {
    const res = await fetch(
      `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/commits?sha=${ctx.branch}&per_page=40`,
      { headers: ghHeaders(ctx.token) },
    );
    if (!res.ok) {
      return jsonRes({ error: 'github list failed', status: res.status, detail: await res.text() }, 502);
    }
    const raw = (await res.json()) as any[];

    const items = raw
      .filter((c) => c.commit?.message?.startsWith('CMS:'))
      .slice(0, 30)
      .map((c) => {
        const fullMsg: string = c.commit.message;
        const firstLine = fullMsg.split('\n')[0];
        const editedByMatch = fullMsg.match(/edited by (.+)/);
        return {
          sha: c.sha as string,
          shortSha: (c.sha as string).slice(0, 7),
          summary: firstLine.replace(/^CMS:\s*/, ''),
          author: editedByMatch ? editedByMatch[1].trim() : 'cms@typemoscow',
          date: c.commit?.author?.date as string,
          url: c.html_url as string,
        };
      });

    return jsonRes({ ok: true, items });
  } catch (err) {
    return jsonRes({ error: 'unexpected', detail: String(err) }, 500);
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POST — откат конкретного коммита.
// Алгоритм: берём изменённые файлы коммита, для каждого восстанавливаем
// содержимое из коммита-родителя и PUT-им поверх текущей версии в main.
// Если между этим коммитом и HEAD были другие правки тех же файлов —
// они тоже потеряются. Это by design, иначе нужен полноценный merge.

export const POST: APIRoute = async ({ request, locals }) => {
  const ctx = getCtx(locals);
  if (!ctx) return jsonRes({ error: 'GITHUB_TOKEN not configured' }, 500);

  try {
    const body = (await request.json()) as { sha?: string };
    const targetSha = body.sha;
    if (!targetSha || typeof targetSha !== 'string') {
      return jsonRes({ error: 'missing sha' }, 400);
    }

    const editorEmail =
      request.headers.get('cf-access-authenticated-user-email') || 'cms@typemoscow';

    // 1. Получаем сам коммит — там лежит parent.sha и list of files
    const commitRes = await fetch(
      `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/commits/${targetSha}`,
      { headers: ghHeaders(ctx.token) },
    );
    if (!commitRes.ok) {
      return jsonRes({ error: 'github commit fetch failed', status: commitRes.status, detail: await commitRes.text() }, 502);
    }
    const commit = (await commitRes.json()) as {
      parents: Array<{ sha: string }>;
      files?: Array<{ filename: string; status: string }>;
      commit: { message: string };
    };
    if (!commit.parents?.[0]?.sha) {
      return jsonRes({ error: 'cannot revert: no parent commit' }, 400);
    }
    const parentSha = commit.parents[0].sha;
    const files = commit.files || [];

    if (files.length === 0) {
      return jsonRes({ error: 'no files changed in target commit' }, 400);
    }

    const reverted: string[] = [];
    const summary = commit.commit.message.split('\n')[0].replace(/^CMS:\s*/, '');

    for (const f of files) {
      // 2a. Файл был добавлен в этом коммите — удаляем через DELETE
      if (f.status === 'added') {
        // Нужен SHA текущего blob'а
        const currRes = await fetch(
          `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}?ref=${ctx.branch}`,
          { headers: ghHeaders(ctx.token) },
        );
        if (currRes.ok) {
          const curr = (await currRes.json()) as { sha: string };
          await fetch(
            `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}`,
            {
              method: 'DELETE',
              headers: ghHeaders(ctx.token),
              body: JSON.stringify({
                message: `Revert ${targetSha.slice(0, 7)}: ${summary}\n\nreverted by ${editorEmail}`,
                sha: curr.sha,
                branch: ctx.branch,
              }),
            },
          );
          reverted.push(f.filename);
        }
        continue;
      }

      // 2b. Файл изменён или удалён — восстанавливаем версию из parent
      const parentFileRes = await fetch(
        `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}?ref=${parentSha}`,
        { headers: ghHeaders(ctx.token) },
      );

      // Получаем текущий SHA файла в main (нужен для PUT)
      const currMainRes = await fetch(
        `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}?ref=${ctx.branch}`,
        { headers: ghHeaders(ctx.token) },
      );

      if (!parentFileRes.ok) {
        // Файл не существовал в parent → значит был добавлен → удаляем из main
        if (currMainRes.ok) {
          const curr = (await currMainRes.json()) as { sha: string };
          await fetch(
            `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}`,
            {
              method: 'DELETE',
              headers: ghHeaders(ctx.token),
              body: JSON.stringify({
                message: `Revert ${targetSha.slice(0, 7)}: ${summary}\n\nreverted by ${editorEmail}`,
                sha: curr.sha,
                branch: ctx.branch,
              }),
            },
          );
          reverted.push(f.filename);
        }
        continue;
      }

      const parentFile = (await parentFileRes.json()) as { content: string };

      if (currMainRes.ok) {
        const curr = (await currMainRes.json()) as { sha: string };
        await fetch(
          `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}`,
          {
            method: 'PUT',
            headers: ghHeaders(ctx.token),
            body: JSON.stringify({
              message: `Revert ${targetSha.slice(0, 7)}: ${summary}\n\nreverted by ${editorEmail}`,
              content: parentFile.content.replace(/\n/g, ''),
              sha: curr.sha,
              branch: ctx.branch,
            }),
          },
        );
        reverted.push(f.filename);
      } else {
        // Файл удалён в main — восстанавливаем
        await fetch(
          `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${f.filename}`,
          {
            method: 'PUT',
            headers: ghHeaders(ctx.token),
            body: JSON.stringify({
              message: `Revert ${targetSha.slice(0, 7)}: ${summary}\n\nreverted by ${editorEmail}`,
              content: parentFile.content.replace(/\n/g, ''),
              branch: ctx.branch,
            }),
          },
        );
        reverted.push(f.filename);
      }
    }

    return jsonRes({
      ok: true,
      revertedSha: targetSha,
      files: reverted,
      note: 'Откат создан. Если файлов было несколько — это несколько коммитов в истории.',
    });
  } catch (err) {
    return jsonRes({ error: 'unexpected', detail: String(err) }, 500);
  }
};

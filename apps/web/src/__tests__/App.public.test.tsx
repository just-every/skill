import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../App';

const catalogFixture = {
  source: 'd1',
  tasks: [
    {
      id: 'task-ci-hardening',
      slug: 'harden-ci-pipeline',
      name: 'Harden CI/CD Pipelines',
      description: 'Secure CI workflows, secrets, and release controls.',
      category: 'devops',
      tags: ['github-actions', 'ci', 'security', 'secrets'],
    },
  ],
  skills: [
    {
      id: 'skill-ci-security-hardening',
      slug: 'ci-security-hardening',
      name: 'CI Security Hardening',
      agentFamily: 'multi',
      summary: 'Workflow hardening skill for GitHub Actions with OIDC and pinned actions.',
      description: 'Hardens CI workflows and enforces secure release patterns.',
      keywords: ['ci', 'security', 'oidc'],
      sourceUrl: 'https://docs.github.com/actions/security-guides',
      importedFrom: 'GitHub docs',
      securityStatus: 'approved',
      securityNotes: 'approved',
      provenance: {
        sourceUrl: 'https://docs.github.com/actions/security-guides',
        repository: 'github/docs',
        importedFrom: 'GitHub docs',
        license: 'CC-BY-4.0',
        lastVerifiedAt: '2026-02-15T00:00:00.000Z',
        checksum: 'fixture',
      },
      securityReview: {
        status: 'approved',
        reviewedBy: 'fixture',
        reviewedAt: '2026-02-15T00:00:00.000Z',
        reviewMethod: 'manual',
        checklistVersion: 'v1',
        notes: 'fixture',
      },
      embedding: [0.1, 0.2, 0.3],
      createdAt: '2026-02-15T00:00:00.000Z',
      updatedAt: '2026-02-15T00:00:00.000Z',
    },
  ],
  runs: [
    {
      id: 'bench-fixture-codex',
      runner: 'fixture-runner',
      mode: 'daytona',
      status: 'completed',
      startedAt: '2026-02-15T01:00:00.000Z',
      completedAt: '2026-02-15T01:10:00.000Z',
      artifactPath: 'benchmarks/runs/2026-02-15-daytona/codex',
      notes: 'fixture run',
    },
  ],
  scores: [
    {
      id: 'score-fixture-1',
      runId: 'bench-fixture-codex',
      agent: 'codex',
      skillId: 'skill-ci-security-hardening',
      taskId: 'task-ci-hardening',
      taskSlug: 'harden-ci-pipeline',
      taskName: 'Harden CI/CD Pipelines',
      overallScore: 95,
      qualityScore: 95,
      securityScore: 96,
      speedScore: 91,
      costScore: 90,
      successRate: 0.95,
      artifactPath: 'benchmarks/runs/2026-02-15-daytona/codex/ci-security-hardening.json',
      createdAt: '2026-02-15T01:05:00.000Z',
    },
  ],
};

describe('public catalog app', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(catalogFixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('renders the redesigned homepage', async () => {
    render(<App />);

    expect(screen.getByText('Master Every Skill with Confidence')).toBeInTheDocument();
    expect(screen.getByText('Explore Verified Skills')).toBeInTheDocument();
    expect((await screen.findAllByText('CI Security Hardening')).length).toBeGreaterThan(0);
  });

  it('renders skills page and recommends CI Security Hardening for CI hardening queries', async () => {
    window.history.replaceState({}, '', '/skills');

    render(<App />);

    expect(screen.getByText('Skills, Benchmarks, and Retrieval Results')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Recommend Skill'));

    expect((await screen.findAllByText('CI Security Hardening')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/slug `ci-security-hardening`/)).length).toBeGreaterThan(0);
    expect(globalThis.fetch).toHaveBeenCalled();
  });
});

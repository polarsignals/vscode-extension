import {describe, it, expect} from 'vitest';
import {normalizeGitUrl, parseProfilePath} from '../../repository/git-utils';

describe('normalizeGitUrl', () => {
  it('normalizes SSH URL', () => {
    expect(normalizeGitUrl('git@github.com:org/repo.git')).toBe('github.com/org/repo');
  });

  it('normalizes SSH URL without .git suffix', () => {
    expect(normalizeGitUrl('git@github.com:org/repo')).toBe('github.com/org/repo');
  });

  it('normalizes HTTPS URL', () => {
    expect(normalizeGitUrl('https://github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('normalizes HTTPS URL without .git suffix', () => {
    expect(normalizeGitUrl('https://github.com/org/repo')).toBe('github.com/org/repo');
  });

  it('normalizes HTTPS URL with auth', () => {
    expect(normalizeGitUrl('https://user@github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('normalizes git:// protocol', () => {
    expect(normalizeGitUrl('git://github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('normalizes HTTP URL', () => {
    expect(normalizeGitUrl('http://github.com/org/repo.git')).toBe('github.com/org/repo');
  });

  it('handles GitLab URLs', () => {
    expect(normalizeGitUrl('git@gitlab.com:team/project.git')).toBe('gitlab.com/team/project');
  });

  it('handles Bitbucket URLs', () => {
    expect(normalizeGitUrl('git@bitbucket.org:team/project.git')).toBe(
      'bitbucket.org/team/project',
    );
  });

  it('handles nested paths', () => {
    expect(normalizeGitUrl('git@github.com:org/sub/repo.git')).toBe('github.com/org/sub/repo');
  });

  it('trims whitespace', () => {
    expect(normalizeGitUrl('  git@github.com:org/repo.git  ')).toBe('github.com/org/repo');
  });

  it('returns null for invalid URL', () => {
    expect(normalizeGitUrl('not-a-url')).toBeNull();
    expect(normalizeGitUrl('')).toBeNull();
  });
});

describe('parseProfilePath', () => {
  it('parses GitHub profile path', () => {
    const result = parseProfilePath('github.com/parca-dev/parca/pkg/query/query.go');
    expect(result).toEqual({
      repoId: 'github.com/parca-dev/parca',
      relativePath: 'pkg/query/query.go',
    });
  });

  it('parses GitLab profile path', () => {
    const result = parseProfilePath('gitlab.com/team/project/src/main.rs');
    expect(result).toEqual({
      repoId: 'gitlab.com/team/project',
      relativePath: 'src/main.rs',
    });
  });

  it('parses Bitbucket profile path', () => {
    const result = parseProfilePath('bitbucket.org/team/project/lib/utils.py');
    expect(result).toEqual({
      repoId: 'bitbucket.org/team/project',
      relativePath: 'lib/utils.py',
    });
  });

  it('handles deeply nested paths', () => {
    const result = parseProfilePath('github.com/org/repo/a/b/c/d/file.go');
    expect(result).toEqual({
      repoId: 'github.com/org/repo',
      relativePath: 'a/b/c/d/file.go',
    });
  });

  it('returns null for unknown hosts', () => {
    expect(parseProfilePath('unknown.com/org/repo/file.go')).toBeNull();
  });

  it('returns null for paths without file component', () => {
    expect(parseProfilePath('github.com/org/repo')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseProfilePath('')).toBeNull();
  });
});

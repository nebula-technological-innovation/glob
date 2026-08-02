export interface GlobOptions {
  cwd?: string;
  dot?: boolean;
  nodir?: boolean;
  onlyFiles?: boolean;
  onlyDirs?: boolean;
  absolute?: boolean;
  followSymlinks?: boolean;
  ignore?: string[];
}

export interface GlobResult {
  path: string;
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function globToRegex(pattern: string): RegExp {
  let regexStr = '';
  let i = 0;

  while (i < pattern.length) {
    const ch = pattern[i]!;

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        // ** — match any path segments
        if (pattern[i + 2] === '/') {
          regexStr += '(?:.+/)?';
          i += 3;
        } else {
          regexStr += '.*';
          i += 2;
        }
      } else {
        // * — match within a single segment
        regexStr += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      regexStr += '[^/]';
      i += 1;
    } else if (ch === '{') {
      // brace expansion: {a,b,c}
      const closeIdx = pattern.indexOf('}', i);
      if (closeIdx !== -1) {
        const choices = pattern.slice(i + 1, closeIdx).split(',').map((s) => s.trim());
        regexStr += `(?:${choices.map(escapeRegex).join('|')})`;
        i = closeIdx + 1;
      } else {
        regexStr += escapeRegex(ch);
        i += 1;
      }
    } else if (ch === '[') {
      const closeIdx = pattern.indexOf(']', i);
      if (closeIdx !== -1) {
        regexStr += pattern.slice(i, closeIdx + 1);
        i = closeIdx + 1;
      } else {
        regexStr += escapeRegex(ch);
        i += 1;
      }
    } else if (ch === '/' || ch === '\\') {
      regexStr += '[\\\\/]';
      i += 1;
    } else {
      regexStr += escapeRegex(ch);
      i += 1;
    }
  }

  return new RegExp(`^${regexStr}$`);
}

function matchesPattern(filePath: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(filePath));
}

export async function glob(
  pattern: string | string[],
  options?: GlobOptions,
): Promise<GlobResult[]> {
  const cwd = options?.cwd ?? process.cwd();
  const ignore = options?.ignore ?? [];
  const patterns = (Array.isArray(pattern) ? pattern : [pattern]).map(globToRegex);
  const ignorePatterns = ignore.map(globToRegex);
  const results: GlobResult[] = [];

  const { walk } = await import('@nebula/filesystem');

  for await (const entry of walk(cwd, {
    followSymlinks: options?.followSymlinks,
    includeFiles: options?.onlyDirs !== true,
    includeDirs: options?.onlyFiles !== true,
  })) {
    const relPath = entry.path.slice(cwd.length + 1);

    if (!options?.dot && entry.name.startsWith('.')) continue;
    if (options?.nodir && entry.isDirectory) continue;
    if (options?.onlyFiles && !entry.isFile) continue;
    if (options?.onlyDirs && !entry.isDirectory) continue;
    if (matchesPattern(relPath, ignorePatterns)) continue;
    if (!matchesPattern(relPath, patterns)) continue;

    results.push({
      path: options?.absolute ? entry.path : relPath,
      name: entry.name,
      isFile: entry.isFile,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
    });
  }

  return results;
}

export async function globFiles(
  pattern: string | string[],
  options?: GlobOptions,
): Promise<string[]> {
  const results = await glob(pattern, { ...options, onlyFiles: true });
  return results.map((r) => r.path);
}

export async function globDirs(
  pattern: string | string[],
  options?: GlobOptions,
): Promise<string[]> {
  const results = await glob(pattern, { ...options, onlyDirs: true });
  return results.map((r) => r.path);
}

export async function hasFiles(
  pattern: string | string[],
  options?: GlobOptions,
): Promise<boolean> {
  const results = await glob(pattern, { ...options, onlyFiles: true });
  return results.length > 0;
}

export async function countFiles(
  pattern: string | string[],
  options?: GlobOptions,
): Promise<number> {
  const results = await glob(pattern, { ...options, onlyFiles: true });
  return results.length;
}

export async function globExtensions(
  dirPath: string,
  extensions: string[],
  options?: GlobOptions,
): Promise<string[]> {
  const extSet = new Set(extensions.map((e) => (e.startsWith('.') ? e : `.${e}`)));
  const results: string[] = [];

  const { walk } = await import('@nebula/filesystem');

  for await (const entry of walk(dirPath, {
    followSymlinks: options?.followSymlinks,
    includeDirs: false,
  })) {
    const ext = entry.name.includes('.') ? entry.name.slice(entry.name.lastIndexOf('.')) : '';
    if (extSet.has(ext)) {
      results.push(options?.absolute ? entry.path : entry.path.slice(dirPath.length + 1));
    }
  }

  return results;
}

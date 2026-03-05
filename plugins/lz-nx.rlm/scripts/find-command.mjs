/**
 * Project-scoped content search command.
 *
 * Runs git grep scoped to project sourceRoots, groups results by project,
 * supports fixed string (default) and regex (/pattern/) modes.
 * Truncates unscoped results at 20 matches with warning.
 *
 * Exports:
 * - runFind(pattern, index, options, workspaceRoot) -> { output, exitCode }
 *
 * Entry point: parses process.argv when run directly.
 */

import { spawnSync } from 'node:child_process';
import { loadIndex } from './shared/index-loader.mjs';
import { error, warn } from './shared/output-format.mjs';
import { filterProjects } from './shared/project-filter.mjs';

/** Maximum matches for unscoped search before truncation. */
const MAX_UNSCOPED_MATCHES = 20;

/**
 * Determine which project a file path belongs to based on source roots.
 *
 * @param {string} filePath - File path from git grep output.
 * @param {object} projects - Projects map from workspace index.
 * @returns {string|null} Project name, or null if no match.
 */
function fileToProject(filePath, projects) {
  let bestMatch = null;
  let bestLength = 0;

  for (const [name, project] of Object.entries(projects)) {
    const root = project.sourceRoot || project.root;

    if (filePath.startsWith(root + '/') || filePath === root) {
      if (root.length > bestLength) {
        bestMatch = name;
        bestLength = root.length;
      }
    }
  }

  return bestMatch;
}

/**
 * Parse git grep output into structured match objects.
 *
 * @param {string} stdout - Raw git grep stdout.
 * @returns {Array<{ file: string, line: string, content: string, raw: string }>}
 */
function parseGrepOutput(stdout) {
  const lines = stdout.split('\n').filter(Boolean);
  const matches = [];

  for (const raw of lines) {
    // git grep output: file:lineNum:content (or file:lineNum-content for context lines)
    const colonIdx = raw.indexOf(':');

    if (colonIdx === -1) {
      continue;
    }

    const file = raw.substring(0, colonIdx);
    const rest = raw.substring(colonIdx + 1);
    const secondColon = rest.indexOf(':');
    const secondDash = rest.indexOf('-');

    // Determine separator position (: for match lines, - for context lines)
    let separatorIdx = -1;

    if (
      secondColon !== -1 &&
      (secondDash === -1 || secondColon <= secondDash)
    ) {
      separatorIdx = secondColon;
    } else if (secondDash !== -1) {
      separatorIdx = secondDash;
    }

    if (separatorIdx !== -1) {
      const line = rest.substring(0, separatorIdx);
      const content = rest.substring(separatorIdx + 1);

      matches.push({ file, line, content, raw });
    } else {
      matches.push({ file, line: '', content: rest, raw });
    }
  }

  return matches;
}

/**
 * Run a project-scoped content search using git grep.
 *
 * @param {string} pattern - Search pattern (fixed string or /regex/).
 * @param {object} index - Workspace index from loadIndex.
 * @param {object} [options] - Options.
 * @param {string} [options.project] - Project name or glob pattern to scope search.
 * @param {number} [options.context] - Number of context lines.
 * @param {string} [workspaceRoot] - Workspace root path.
 * @returns {{ output: string, exitCode: number }}
 */
export function runFind(pattern, index, options = {}, workspaceRoot = '.') {
  if (!pattern) {
    return {
      output: '[ERROR] Missing required argument: <pattern>',
      exitCode: 1,
    };
  }

  const isScoped = !!options.project;
  let sourceRoots = [];

  if (isScoped) {
    const projectNames = Object.keys(index.projects);
    const matchedProjects = filterProjects(options.project, projectNames);

    if (matchedProjects.length === 0) {
      return {
        output:
          "[ERROR] Project '" +
          options.project +
          "' not found (" +
          index.meta.projectCount +
          ' indexed)',
        exitCode: 1,
      };
    }

    sourceRoots = matchedProjects.map((name) => {
      const project = index.projects[name];

      return project.sourceRoot || project.root;
    });
  }

  // Detect regex mode: /pattern/ delimiters
  let searchPattern = pattern;
  let isRegex = false;

  if (pattern.startsWith('/') && pattern.endsWith('/') && pattern.length > 2) {
    searchPattern = pattern.slice(1, -1);
    isRegex = true;
  }

  // Build git grep arguments
  const args = ['grep', '-n', '--no-color'];

  if (!isRegex) {
    args.push('-F');
  }

  if (options.context && options.context > 0) {
    args.push('-C' + options.context);
  }

  args.push('--');
  args.push(searchPattern);

  if (isScoped && sourceRoots.length > 0) {
    args.push(...sourceRoots);
  }

  // Run git grep
  const result = spawnSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 5 * 1024 * 1024,
  });

  // Exit code 1 = no matches (not an error), exit code > 1 = actual error
  if (result.status > 1) {
    return {
      output: '[ERROR] git grep failed: ' + (result.stderr || 'unknown error'),
      exitCode: 1,
    };
  }

  if (result.status === 1 || !result.stdout || result.stdout.trim() === '') {
    return {
      output: "No matches found for '" + pattern + "'",
      exitCode: 0,
    };
  }

  // Parse and group results
  const matches = parseGrepOutput(result.stdout);
  const totalMatches = matches.length;

  // Truncate unscoped results
  let truncated = false;
  let displayMatches = matches;

  if (!isScoped && totalMatches > MAX_UNSCOPED_MATCHES) {
    displayMatches = matches.slice(0, MAX_UNSCOPED_MATCHES);
    truncated = true;
  }

  // Group by project
  const groups = new Map();

  for (const match of displayMatches) {
    const projectName =
      fileToProject(match.file, index.projects) || '(unknown)';

    if (!groups.has(projectName)) {
      groups.set(projectName, []);
    }

    groups.get(projectName).push(match);
  }

  // Format output
  const lines = [];

  for (const [projectName, projectMatches] of groups) {
    const matchWord = projectMatches.length === 1 ? 'match' : 'matches';

    lines.push(
      projectName + ' (' + projectMatches.length + ' ' + matchWord + ')',
    );

    for (const match of projectMatches) {
      lines.push('  ' + match.raw);
    }

    lines.push('');
  }

  if (truncated) {
    lines.push(
      '[WARN] Showing ' +
        MAX_UNSCOPED_MATCHES +
        ' of ' +
        totalMatches +
        ' matches. Use --project to narrow results.',
    );
    lines.push('');
  }

  const projectCount = groups.size;
  const displayCount = displayMatches.length;
  const matchWord = displayCount === 1 ? 'match' : 'matches';
  const projectWord = projectCount === 1 ? 'project' : 'projects';

  lines.push(
    displayCount + ' ' + matchWord + ' in ' + projectCount + ' ' + projectWord,
  );

  return {
    output: lines.join('\n'),
    exitCode: 0,
  };
}

// ─── Entry point ───

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('find-command.mjs') ||
    process.argv[1].endsWith('find-command'));

if (isMain) {
  const args = process.argv.slice(2);
  let searchPattern = null;
  let project = undefined;
  let context = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && i + 1 < args.length) {
      project = args[i + 1];
      i++;
    } else if (args[i] === '--context' && i + 1 < args.length) {
      context = parseInt(args[i + 1], 10);
      i++;
    } else if (!args[i].startsWith('--')) {
      searchPattern = args[i];
    }
  }

  const workspaceRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!searchPattern) {
    error('Missing required argument: <pattern>');
    process.exit(1);
  }

  try {
    const index = loadIndex(workspaceRoot);
    const opts = {};

    if (project) {
      opts.project = project;
    }

    if (context !== undefined) {
      opts.context = context;
    }

    const { output, exitCode } = runFind(
      searchPattern,
      index,
      opts,
      workspaceRoot,
    );

    process.stdout.write(output + '\n');
    process.exit(exitCode);
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

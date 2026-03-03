# Testing Patterns

**Analysis Date:** 2026-03-03

## Project Testing Context

This is a Claude Code plugin repository. Testing focuses on:
- Hook script behavior and input parsing
- Command validation and pattern matching
- Plugin structure and configuration validity
- Cross-platform script execution
- JSON configuration validity

No testing framework has been configured yet in the repository. The following patterns should be adopted when implementing tests.

## Test Framework

**Recommended Runner:**
- Vitest (modern, fast, ES module support)
- Alternative: Jest (mature, comprehensive)

**Assertion Library:**
- Node.js built-in `assert` module (minimal setup)
- Vitest uses `chai` assertions
- Jest has built-in assertions

**Run Commands:**
```bash
npm test                    # Run all tests
npm test -- --watch        # Watch mode
npm test -- --coverage     # Coverage report
```

## Test File Organization

**Location:**
- Co-located with source: `hooks/scripts/my-hook.test.js` alongside `hooks/scripts/my-hook.js`
- Alternatively: `tests/hooks/my-hook.test.js` in separate directory

**Naming:**
- `.test.js` or `.test.ts` suffix for test files
- Filename matches source: `hook-parser.js` → `hook-parser.test.js`

**Structure:**
```
plugins/my-plugin/
├── hooks/
│   ├── scripts/
│   │   ├── my-hook.js
│   │   ├── my-hook.test.js
│   │   └── post-tool-handler.test.js
│   └── hooks.json
├── __tests__/              # Optional: separate test directory
│   └── integration.test.js
└── package.json
```

## Test Structure

**Suite Organization:**
```javascript
describe('PostToolUseHandler', () => {
  describe('when tool succeeds', () => {
    it('should return allow decision', () => {
      // test
    });
  });

  describe('when tool fails', () => {
    it('should return block decision with error message', () => {
      // test
    });
  });
});
```

**Patterns:**
- Use `describe()` blocks to organize related tests
- One test per scenario (happy path, error case, edge case)
- Test names describe expected behavior: "should return X when Y happens"
- Arrange-Act-Assert pattern for test structure

**Setup/Teardown:**
```javascript
beforeEach(() => {
  // Initialize test fixtures, mock data
});

afterEach(() => {
  // Clean up temporary files, reset mocks
});
```

## Mocking

**Framework:**
- Node.js: Use `jest.mock()` or `sinon` for mocking
- Vitest: Use `vi.mock()` with similar API to Jest

**Patterns:**
```javascript
// Mock console to capture logs
const consoleSpy = vi.spyOn(console, 'log');

// Mock file system
vi.mock('fs');

// Mock external module
vi.mock('some-dependency', () => ({
  getData: () => ({ value: 'mocked' })
}));

// Restore after test
afterEach(() => {
  vi.clearAllMocks();
});
```

**What to Mock:**
- External API calls (always mock in unit tests)
- File system operations (use temporary directories for integration tests)
- External dependencies and npm packages
- Console output (capture and verify)
- Timestamps (mock `Date.now()` for deterministic tests)

**What NOT to Mock:**
- Internal utility functions (test them directly)
- Core plugin logic (test the real behavior)
- JSON parsing/validation (these should work correctly)
- Basic Node.js modules like `path`, `util`

## Fixtures and Factories

**Test Data:**
```javascript
// Mock hook input in different formats
const mockToolResultFormat = {
  tool_result: 'Build successful'
};

const mockToolResponseFormat = {
  tool_response: {
    stdout: 'Build successful'
  }
};

// Factory function for creating test inputs
function createHookInput(stdout = '', stderr = '') {
  return {
    tool_response: { stdout, stderr }
  };
}

// Test
it('should handle both input formats', () => {
  expect(handler(mockToolResultFormat)).toEqual(expect.objectContaining({
    decision: 'allow'
  }));

  expect(handler(mockToolResponseFormat)).toEqual(expect.objectContaining({
    decision: 'allow'
  }));
});
```

**Location:**
- Place fixtures in `tests/fixtures/` directory
- Or inline in test file for simple cases
- Reusable factories in `tests/factories.js`

## Coverage

**Requirements:**
- Aim for >80% coverage of hook scripts
- Commands and skills: >70% coverage (lower priority, more editorial)
- Focus on critical paths and error cases

**View Coverage:**
```bash
npm test -- --coverage
npm test -- --coverage --reporter=html  # HTML report
npm test -- --coverage --reporter=text-summary
```

## Test Types

**Unit Tests:**
- Scope: Single function or module
- Approach: Test input/output without external dependencies
- Location: `hooks/scripts/*.test.js`
- Example: Test hook input parsing handles both format variations

**Integration Tests:**
- Scope: Multiple modules working together
- Approach: Test hook + Claude interaction, command validation
- Location: `tests/integration/*.test.js`
- Example: Test that a hook correctly identifies build failures and blocks with appropriate message

**E2E Tests:**
- Framework: Not currently used
- Future: Playwright or Puppeteer could test plugin UI/commands
- Would require plugin runtime environment

## Common Patterns

**Async Testing:**
```javascript
it('should handle async hook execution', async () => {
  const handler = require('./async-hook');
  const result = await handler(mockInput);

  expect(result.decision).toBe('allow');
});

// Or with done callback
it('should complete callback', (done) => {
  handler(mockInput, (err, result) => {
    expect(result).toBeDefined();
    done();
  });
});
```

**Error Testing:**
```javascript
it('should block when input is invalid', () => {
  const result = handler(null);  // or undefined, or malformed

  expect(result).toEqual({
    decision: 'block',
    reason: expect.stringContaining('Invalid input')
  });
});

it('should throw error for missing required field', () => {
  const malformedInput = { /* missing tool_result */ };

  expect(() => handler(malformedInput)).toThrow('Missing required field');
});
```

**Snapshot Testing:**
```javascript
it('should format output consistently', () => {
  const result = formatOutput(mockData);

  expect(result).toMatchSnapshot();
});
```

## Hook Script Testing

**Testing PostToolUse Hooks:**

Hook scripts are the most critical components to test. Each hook should verify:
1. Input parsing works for both `tool_result` and `tool_response` formats
2. Error conditions return `{ decision: 'block', reason: '...' }`
3. Success conditions return `{ decision: 'allow' }` or include `additionalContext`
4. Edge cases are handled (empty strings, null, malformed JSON)

**Example Test Suite:**
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import postToolHandler from './post-tool-handler';

describe('PostToolHandler', () => {
  let mockInput;

  beforeEach(() => {
    mockInput = {
      tool_response: {
        stdout: 'Build successful'
      }
    };
  });

  describe('input parsing', () => {
    it('should handle tool_result format', () => {
      const input = { tool_result: 'Success' };
      const result = postToolHandler(input);

      expect(result.decision).toBe('allow');
    });

    it('should handle tool_response format', () => {
      const input = { tool_response: { stdout: 'Success' } };
      const result = postToolHandler(input);

      expect(result.decision).toBe('allow');
    });

    it('should prefer tool_result over tool_response', () => {
      const input = {
        tool_result: 'Result A',
        tool_response: { stdout: 'Result B' }
      };
      const result = postToolHandler(input);

      expect(result.additionalContext).toContain('Result A');
    });
  });

  describe('error handling', () => {
    it('should block when input is empty', () => {
      const input = { tool_result: '' };
      const result = postToolHandler(input);

      expect(result.decision).toBe('block');
      expect(result.reason).toBeDefined();
    });

    it('should block when input is null or undefined', () => {
      expect(postToolHandler(null).decision).toBe('block');
      expect(postToolHandler(undefined).decision).toBe('block');
      expect(postToolHandler({}).decision).toBe('block');
    });
  });

  describe('business logic', () => {
    it('should allow successful build output', () => {
      mockInput.tool_response.stdout = 'Build successful';
      const result = postToolHandler(mockInput);

      expect(result.decision).toBe('allow');
    });

    it('should block on build errors', () => {
      mockInput.tool_response.stdout = 'Error: failed to build';
      const result = postToolHandler(mockInput);

      expect(result.decision).toBe('block');
      expect(result.reason).toContain('build');
    });
  });
});
```

## Command Validation Testing

**Testing allowed-tools Patterns:**

Commands define `allowed-tools` to restrict operations. Test that patterns work as expected:

```javascript
describe('Command Pattern Matching', () => {
  function matchPattern(command, pattern) {
    // Implement pattern matching logic from commands
    const [base, ...parts] = pattern.split(' ');
    const cmdParts = command.split(' ');

    if (base !== cmdParts[0]) return false;
    if (pattern.endsWith('*')) return true;
    return parts.length === cmdParts.slice(1).length;
  }

  it('should match nx build with wildcard', () => {
    expect(matchPattern('nx build my-app', 'Bash(nx build *)')).toBe(true);
  });

  it('should match full nx commands with double wildcard', () => {
    expect(matchPattern('nx run my-app:build --prod', 'Bash(nx *)')).toBe(true);
  });

  it('should not match outside pattern scope', () => {
    expect(matchPattern('rm -rf /tmp', 'Bash(nx build *)')).toBe(false);
  });
});
```

## Plugin Configuration Testing

**Validate hooks.json:**

Test that hook configurations are valid and properly structured:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Plugin Configuration', () => {
  it('should have valid hooks.json structure', () => {
    const hooksPath = path.join(__dirname, '../hooks/hooks.json');
    const content = fs.readFileSync(hooksPath, 'utf-8');
    const hooks = JSON.parse(content);

    expect(hooks).toHaveProperty('hook_definitions');
    expect(Array.isArray(hooks.hook_definitions)).toBe(true);
  });

  it('should have valid environment variable substitution', () => {
    const hooksPath = path.join(__dirname, '../hooks/hooks.json');
    const content = fs.readFileSync(hooksPath, 'utf-8');

    // Check that ${CLAUDE_PLUGIN_ROOT} is used correctly (not in command markdown)
    expect(content).toMatch(/\$\{CLAUDE_PLUGIN_ROOT\}/);
  });

  it('should reference existing hook scripts', () => {
    const hooksPath = path.join(__dirname, '../hooks/hooks.json');
    const content = fs.readFileSync(hooksPath, 'utf-8');
    const hooks = JSON.parse(content);

    hooks.hook_definitions.forEach(hook => {
      if (hook.handler && hook.handler.startsWith('./')) {
        const scriptPath = path.join(__dirname, '../hooks', hook.handler);
        expect(fs.existsSync(scriptPath)).toBe(true);
      }
    });
  });
});
```

## Best Practices

1. **Test behavior, not implementation** - Focus on what the hook/command does, not how
2. **Clear test names** - Name should describe scenario and expected outcome
3. **Single responsibility** - One assertion or closely related assertions per test
4. **Mock external dependencies** - Keep unit tests fast and focused
5. **Use factories for complex test data** - Reduces duplication and improves readability
6. **Test error paths** - Don't just test the happy path; test failures
7. **Cross-platform verification** - Run tests on Windows, macOS, and Linux
8. **Document test data** - Include comments explaining why certain test values are used

---

*Testing analysis: 2026-03-03*

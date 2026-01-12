# Technical Design Document

## Project: bugfix-core-docs-generation

**Project Name:** sdd-mcp-server  
**Bug Fix:** Unified Module Loading System for Cross-Context Compatibility  
**Architecture Pattern:** Layered Module Resolution with Fallback Strategy  
**Language:** TypeScript (ES Modules)

Generated on: 2025-11-04T16:00:47.970Z  
Updated on: 2025-11-04T16:05:00.000Z

## Problem Analysis

### Current Architecture (Broken)

```
Entry Point: src/index.ts
├── handleSteeringSimplified()
│   └── await import('./utils/documentGenerator.js')  ❌ HARDCODED
├── handleRequirementsSimplified()
│   └── await import('./utils/specGenerator.js')      ❌ HARDCODED
├── handleDesignSimplified()
│   └── await import('./utils/specGenerator.js')      ❌ HARDCODED
└── handleTasksSimplified()
    └── await import('./utils/specGenerator.js')      ❌ HARDCODED

Execution Contexts:
- npx (node_modules/.bin/) → Fails to find ./utils/
- node dist/index.js → Works (dist/utils/ exists)
- npm run dev (tsx) → Works (src/utils/ exists)
- npm start → Works (dist/utils/ exists)
```

**Problem**: Hardcoded paths assume a single directory structure, but the actual structure varies by execution context.

### Target Architecture (Fixed)

```
Entry Point: src/index.ts
├── Import: moduleLoader from './utils/moduleLoader.js'
├── handleSteeringSimplified()
│   └── loadDocumentGenerator() → tries multiple paths ✅
├── handleRequirementsSimplified()
│   └── loadSpecGenerator() → tries multiple paths ✅
├── handleDesignSimplified()
│   └── loadSpecGenerator() → tries multiple paths ✅
└── handleTasksSimplified()
    └── loadSpecGenerator() → tries multiple paths ✅

Module Loader: src/utils/moduleLoader.ts
├── loadDocumentGenerator()
│   ├── try: './utils/documentGenerator.js'   (compiled, from dist/)
│   ├── try: '../utils/documentGenerator.js'  (compiled, from dist/subdir)
│   ├── try: './documentGenerator.js'         (root level, npm package)
│   └── try: '../documentGenerator.js'        (root level, alternative)
└── loadSpecGenerator()
    ├── try: './utils/specGenerator.js'
    ├── try: '../utils/specGenerator.js'
    ├── try: './specGenerator.js'
    └── try: '../specGenerator.js'
```

## Architecture Design

### Component Overview

```
┌─────────────────────────────────────────────────────────┐
│                  MCP Server Entry Points                │
│  ┌────────────────┐         ┌────────────────┐         │
│  │ mcp-server.js  │         │ dist/index.js  │         │
│  │ (root level)   │         │ (compiled TS)  │         │
│  └────────┬───────┘         └────────┬───────┘         │
│           │                          │                  │
│           │ Already has fallback     │ Needs fix       │
│           └──────────────┬───────────┘                  │
└──────────────────────────┼──────────────────────────────┘
                           │
                           ▼
          ┌────────────────────────────────┐
          │   Module Loader (NEW)          │
          │   src/utils/moduleLoader.ts    │
          │                                │
          │  ┌──────────────────────────┐  │
          │  │ loadDocumentGenerator()  │  │
          │  │  - Sequential path tries │  │
          │  │  - Error accumulation    │  │
          │  │  - Debug logging         │  │
          │  └──────────────────────────┘  │
          │                                │
          │  ┌──────────────────────────┐  │
          │  │ loadSpecGenerator()      │  │
          │  │  - Sequential path tries │  │
          │  │  - Error accumulation    │  │
          │  │  - Debug logging         │  │
          │  └──────────────────────────┘  │
          └────────────┬───────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
┌───────────────────┐      ┌──────────────────────┐
│ documentGenerator │      │  specGenerator       │
│  - analyzeProject │      │  - generateRequir... │
│  - generateProd.. │      │  - generateDesign... │
│  - generateTech.. │      │  - generateTasks...  │
│  - generateStru.. │      │                      │
└───────────────────┘      └──────────────────────┘
```

### Module: moduleLoader.ts

**Location**: `src/utils/moduleLoader.ts`

**Purpose**: Provide unified, context-independent module loading for documentGenerator and specGenerator

**Interface**:
```typescript
export interface DocumentGeneratorModule {
  analyzeProject(projectPath: string): Promise<ProjectAnalysis>;
  generateProductDocument(analysis: ProjectAnalysis): string;
  generateTechDocument(analysis: ProjectAnalysis): string;
  generateStructureDocument(analysis: ProjectAnalysis): string;
}

export interface SpecGeneratorModule {
  generateRequirementsDocument(projectPath: string, featureName: string): Promise<string>;
  generateDesignDocument(projectPath: string, featureName: string): Promise<string>;
  generateTasksDocument(projectPath: string, featureName: string): Promise<string>;
}

export async function loadDocumentGenerator(): Promise<DocumentGeneratorModule>;
export async function loadSpecGenerator(): Promise<SpecGeneratorModule>;
```

**Implementation Strategy**:

1. **Sequential Path Resolution**
   - Try each path in order until one succeeds
   - Collect error messages from failed attempts
   - Return first successful import

2. **Path Priority Order**
   ```typescript
   const DOCUMENT_GENERATOR_PATHS = [
     './utils/documentGenerator.js',    // Priority 1: Compiled TypeScript in dist/utils/
     '../utils/documentGenerator.js',   // Priority 2: From subdirectory (e.g., dist/tools/)
     './documentGenerator.js',          // Priority 3: Root-level published package
     '../documentGenerator.js'          // Priority 4: Alternative root-level
   ];
   ```

3. **Error Handling**
   ```typescript
   const errors: string[] = [];
   for (const path of paths) {
     try {
       const module = await import(path);
       console.error(`[SDD-DEBUG] ✅ Loaded from: ${path}`);
       return module;
     } catch (error) {
       errors.push(`${path}: ${error.message}`);
     }
   }
   throw new Error(
     `Failed to load module. Attempted paths:\n${errors.join('\n')}`
   );
   ```

4. **Debug Logging**
   - Log successful path for troubleshooting
   - Include all attempted paths in error message
   - Use stderr for debug output (doesn't interfere with MCP stdio)

### Module: Updated src/index.ts

**Changes Required**: 4 locations

#### 1. handleSteeringSimplified() (~line 395)

**Before**:
```typescript
try {
  const { analyzeProject, generateProductDocument, generateTechDocument, generateStructureDocument } 
    = await import('./utils/documentGenerator.js');
  // ... use functions
} catch (importError) {
  // Fallback to templates
}
```

**After**:
```typescript
import { loadDocumentGenerator } from './utils/moduleLoader.js';

try {
  const { analyzeProject, generateProductDocument, generateTechDocument, generateStructureDocument } 
    = await loadDocumentGenerator();
  // ... use functions
} catch (importError) {
  // Fallback to templates (with better error message)
}
```

#### 2-4. handleRequirementsSimplified, handleDesignSimplified, handleTasksSimplified

Similar pattern - replace hardcoded `import('./utils/specGenerator.js')` with `loadSpecGenerator()`

### Data Flow

#### Success Path (Module Found)
```
User invokes sdd-steering
  ↓
handleSteeringSimplified() called
  ↓
loadDocumentGenerator() invoked
  ↓
Try './utils/documentGenerator.js'
  ↓ (SUCCESS in dist/ context)
Module loaded successfully
  ↓
analyzeProject(projectPath) called
  ↓
Project analysis performed (language, framework, architecture detection)
  ↓
Generate product.md, tech.md, structure.md with analysis data
  ↓
Write files to .kiro/steering/
  ↓
Return success message to user
```

#### Fallback Path (Module Not Found)
```
User invokes sdd-steering
  ↓
handleSteeringSimplified() called
  ↓
loadDocumentGenerator() invoked
  ↓
Try './utils/documentGenerator.js' → FAIL (collect error)
  ↓
Try '../utils/documentGenerator.js' → FAIL (collect error)
  ↓
Try './documentGenerator.js' → FAIL (collect error)
  ↓
Try '../documentGenerator.js' → FAIL (collect error)
  ↓
Throw error with all attempted paths
  ↓
Catch in handleSteeringSimplified()
  ↓
Log debug error message
  ↓
Generate template documents with warning
  ↓
Return fallback message to user
```

### Error Handling Strategy

**Layered Error Handling**:

1. **Module Loader Level** (moduleLoader.ts)
   - Catch individual import failures
   - Accumulate error messages
   - Throw comprehensive error if all paths fail

2. **Handler Level** (src/index.ts)
   - Catch module loader errors
   - Log detailed debug information
   - Gracefully fallback to template generation
   - Inform user of fallback with reason

3. **User Experience**
   - Clear indication when analysis-backed generation works
   - Warning message when fallback templates are used
   - Error details in debug logs (not shown to user)

## Implementation Details

### File Structure After Implementation

```
src/
├── utils/
│   ├── moduleLoader.ts          ← NEW FILE
│   ├── documentGenerator.ts     (existing)
│   └── specGenerator.ts         (existing)
└── index.ts                     ← MODIFIED (4 locations)

dist/ (after build)
├── utils/
│   ├── moduleLoader.js          ← COMPILED
│   ├── moduleLoader.d.ts
│   ├── documentGenerator.js     (existing)
│   └── specGenerator.js         (existing)
└── index.js                     ← MODIFIED

Root level (published package)
├── documentGenerator.js         (existing, for backward compat)
├── specGenerator.js             (existing, for backward compat)
└── mcp-server.js               (existing, already has fallback)
```

### TypeScript Configuration

No changes needed - existing `tsconfig.json` already compiles `src/utils/*.ts` to `dist/utils/*.js`

### Build Output Verification

After `npm run build`, verify:
```bash
ls -la dist/utils/moduleLoader.js     # Should exist
ls -la dist/utils/documentGenerator.js # Should exist
ls -la dist/utils/specGenerator.js    # Should exist
```

## Testing Strategy

### Unit Tests

**Test File**: `src/__tests__/unit/utils/moduleLoader.test.ts`

**Test Cases**:
1. `loadDocumentGenerator()` successfully imports from first path
2. `loadDocumentGenerator()` falls back to second path when first fails
3. `loadDocumentGenerator()` throws error when all paths fail
4. `loadSpecGenerator()` successfully imports from first path
5. `loadSpecGenerator()` falls back to second path when first fails
6. `loadSpecGenerator()` throws error when all paths fail
7. Error messages include all attempted paths
8. Debug logging outputs successful path

### Integration Tests

**Test Scenarios**:
1. Run from `dist/index.js` - module loads from `./utils/`
2. Run from `mcp-server.js` - module loads from root level
3. Run with `tsx` - module loads from `src/utils/`
4. Simulate npx environment - module loads successfully

### Manual Testing

**Test Plan**:
```bash
# Test 1: Built version
npm run build
node dist/index.js
# Call sdd-steering tool → Should generate analyzed docs

# Test 2: Development mode
npm run dev
# Call sdd-steering tool → Should generate analyzed docs

# Test 3: Production mode
npm start
# Call sdd-steering tool → Should generate analyzed docs

# Test 4: Simulate npx (local test)
cd /tmp
npx /path/to/sdd-mcp-server
# Call sdd-steering tool → Should generate analyzed docs
```

## Performance Considerations

**Module Loading**:
- First attempt typically succeeds (< 10ms)
- Worst case: 4 attempts × ~25ms = 100ms (within NFR-1 requirement)
- Loaded modules are cached by Node.js (subsequent calls are instant)

**Memory**:
- Module loader adds ~5KB to bundle
- No runtime memory overhead (functions, not state)
- Well within < 100MB requirement

## Security Considerations

**No Security Risks**:
- No user input in import paths (all paths are hardcoded)
- No dynamic path construction from external sources
- No file system access beyond standard ES module imports
- No changes to MCP stdio protocol or external interfaces

## Backward Compatibility

**Maintained**:
- ✅ Existing MCP tool interfaces unchanged
- ✅ Existing steering document format unchanged
- ✅ Existing package.json structure unchanged
- ✅ Existing build process unchanged
- ✅ Root-level files (documentGenerator.js, specGenerator.js) remain for compatibility
- ✅ mcp-server.js entry point unchanged

**Breaking Changes**:
- ❌ None

## Rollback Plan

If issues arise:
1. Revert changes to `src/index.ts` (restore hardcoded imports)
2. Delete `src/utils/moduleLoader.ts`
3. Run `npm run build`
4. System reverts to previous behavior (npx fails, but other methods work)

## Success Validation

**Acceptance Checklist**:
- [ ] `npm run build` completes without errors
- [ ] `dist/utils/moduleLoader.js` exists
- [ ] TypeScript compilation has zero errors
- [ ] All existing tests pass
- [ ] `node dist/index.js` + sdd-steering generates analyzed docs
- [ ] `npm run dev` + sdd-steering generates analyzed docs
- [ ] `npm start` + sdd-steering generates analyzed docs
- [ ] Local npx simulation + sdd-steering generates analyzed docs
- [ ] Generated product.md contains actual project analysis
- [ ] Generated tech.md contains actual tech stack
- [ ] Generated structure.md contains actual directory structure
- [ ] Error messages are clear when all paths fail
- [ ] Debug logs show which path succeeded

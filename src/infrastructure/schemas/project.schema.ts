// JSON schemas for project data validation

export const projectSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    path: { type: 'string', minLength: 1 },
    phase: { 
      type: 'string', 
      enum: ['init', 'requirements-generated', 'design-generated', 'tasks-generated', 'implementation-ready'] 
    },
    metadata: {
      type: 'object',
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        language: { type: 'string', enum: ['en', 'ja', 'zh-TW'] },
        approvals: {
          type: 'object',
          properties: {
            requirements: {
              type: 'object',
              properties: {
                generated: { type: 'boolean' },
                approved: { type: 'boolean' }
              },
              required: ['generated', 'approved']
            },
            design: {
              type: 'object',
              properties: {
                generated: { type: 'boolean' },
                approved: { type: 'boolean' }
              },
              required: ['generated', 'approved']
            },
            tasks: {
              type: 'object',
              properties: {
                generated: { type: 'boolean' },
                approved: { type: 'boolean' }
              },
              required: ['generated', 'approved']
            }
          },
          required: ['requirements', 'design', 'tasks']
        }
      },
      required: ['createdAt', 'updatedAt', 'language', 'approvals']
    }
  },
  required: ['id', 'name', 'path', 'phase', 'metadata']
} as const;

export const requirementSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    objective: { type: 'string', minLength: 1 },
    acceptanceCriteria: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
      minItems: 1
    }
  },
  required: ['id', 'title', 'objective', 'acceptanceCriteria']
} as const;

export const taskSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    requirements: {
      type: 'array',
      items: { type: 'string', minLength: 1 }
    },
    completed: { type: 'boolean' }
  },
  required: ['id', 'title', 'description', 'requirements', 'completed']
} as const;

export const qualityReportSchema = {
  type: 'object',
  properties: {
    score: { type: 'string', enum: ['good', 'passable', 'garbage'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['complexity', 'special-case', 'data-structure', 'breaking-change', 'practicality'] },
          message: { type: 'string', minLength: 1 },
          severity: { type: 'string', enum: ['error', 'warning', 'info'] },
          location: {
            type: 'object',
            properties: {
              file: { type: 'string', minLength: 1 },
              line: { type: 'number', minimum: 1 },
              column: { type: 'number', minimum: 1 }
            },
            required: ['file', 'line', 'column']
          }
        },
        required: ['type', 'message', 'severity']
      }
    },
    recommendations: {
      type: 'array',
      items: { type: 'string', minLength: 1 }
    }
  },
  required: ['score', 'issues', 'recommendations']
} as const;
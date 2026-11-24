---
name: coding-style
description: Enforce consistent TypeScript/JavaScript coding conventions and design principles
priority: 100
alwaysActive: true
---

# Coding Style Rules

Follow the conventions already in the file and module you edit. The compiler and the lint ratchet enforce types and complexity; these rules cover judgment.

## TypeScript/JavaScript Guidelines

- Give exported functions explicit parameter and return types.
- Prefer `unknown` and narrowing to `any`.
- Name classes in PascalCase, functions in camelCase, and constants in UPPER_SNAKE_CASE.
- Keep functions small; use early returns and an options object past three or four parameters.

## Core Design Principles

### S - Single Responsibility Principle (SRP)
A module has one reason to change. Split a class that mixes unrelated work.

### D - Dependency Inversion Principle (DIP)
Depend on ports and interfaces; inject concrete adapters.

### DRY (Don't Repeat Yourself)
Keep each fact in one authoritative place. Extract repeated logic and magic values.

### KISS (Keep It Simple)
Choose the simplest design that meets the requirement.

### YAGNI (You Aren't Gonna Need It)
Do not add options, layers, or hooks that no current requirement uses.

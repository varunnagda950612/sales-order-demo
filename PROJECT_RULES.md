# PROJECT_RULES.md

## General Rules

- Read `AI_CONTEXT.md` before starting any task.
- Inspect all relevant files and dependencies before making changes.
- Understand the existing implementation before writing code.
- Do not make assumptions about the project architecture.
- Follow the existing coding style, naming conventions, and folder structure.
- Reuse existing components, services, utilities, and helper functions whenever possible.
- Do not duplicate existing functionality.
- Minimize changes outside the requested task.
- Do not rewrite or refactor existing architecture unless explicitly asked.
- Preserve backward compatibility with existing functionality.
- Ask before introducing new libraries, major architectural changes, or database schema changes.

## Implementation Rules

- Before writing code, identify the files that need to be inspected and understand the complete flow before making changes.
- Modify only the files necessary for the requested task.
- If a dependency is found in another file, inspect that file before making changes.
- Prefer extending existing functionality over creating new implementations.
- Keep functions and components consistent with the rest of the project.
- If there are multiple possible approaches, explain the trade-offs before implementing.
- If any requirement or existing implementation is unclear, ask for clarification instead of making assumptions.

## Before Completing a Task

- Verify that existing functionality has not been broken.
- Check for potential side effects introduced by the changes.
- Update `AI_CONTEXT.md` if the task introduces permanent architectural, business logic, API, or workflow changes.
- Briefly summarize which files were modified and why.
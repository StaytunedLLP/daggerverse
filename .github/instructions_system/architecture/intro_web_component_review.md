# GitHub Copilot Coding Guidelines for Web Component Reviews

This file contains coding guidelines for GitHub Copilot to use when reviewing
web components in our codebase. These guidelines are specifically tailored for
Material Design 3 (M3) web components using HTML, CSS, and TypeScript.

## Guideline 1: CSS-Centric Styling Approach

**Name:** Use CSS selectors for state/variant styling, avoid JS manipulation

**Description:** Components must use CSS attribute selectors
(`:host([disabled])`, `:host([variant="outlined"])`) and pseudo-classes
(`:hover`, `:focus-visible`, etc.) for all visual styling. Avoid JS for visual
state changes. Never use `element.style` or class toggling for visual states.
All state changes should be reflected through host attributes that CSS can
target. Check that component states properly update both attributes and ARIA
properties.

## Guideline 2: Strict M3 Token Usage

**Name:** Only use M3 design tokens for styling, no hardcoded values

**Description:** All component styling must exclusively use Material Design 3
tokens (`--md-sys-color-*`, `--md-sys-typescale-*`, `--md-sys-shape-*`) for
colors, typography, spacing, shape, elevation, and motion. Never use hardcoded
color values, font sizes, or spacing. Verify proper token usage for each
component part, state layer mechanics (color + opacity), and proper surface tint
application. Units must be `rem`-based following the `1dp = 1rem` convention,
with no `px` units except for hairlines.

## Guideline 3: Container Queries for Responsive Design

**Name:** Use container queries for responsive layouts, not media queries

**Description:** Components must use `@container` queries with named breakpoints
for responsive layouts, not `@media` queries. Verify components define
`container-type` (usually `inline-size`). Check that responsive layouts follow
the design system breakpoints: Compact (base styles), Medium (min-width:
37.5rem), Expanded (min-width: 52.5rem), Large (min-width: 75rem), and
Extra-large (min-width: 100rem). Fluid values should use `clamp()` for
typography and spacing.

## Guideline 4: Comprehensive Type Definitions and Attribute Management

**Name:** Use type definitions and proper attribute management

**Description:** Components must define and use `COMPONENT_ATTRIBUTE_TYPES` for
all attributes, documenting type, description, default values, and possible
values. The `attributeChangedCallback` must implement: 1) type coercion based on
these definitions, 2) update private state properties, 3) reflect state to host
attributes for CSS targeting, and 4) update ARIA attributes. Verify proper
getter/setter implementations and default value management.

## Guideline 5: Accessibility Implementation

**Name:** Implement all required accessibility features

**Description:** Components must implement proper accessibility features
including: 1) semantic HTML elements, 2) ARIA roles, states, and properties
correctly updated based on component state, 3) proper focus management with
visible focus indicators, 4) keyboard navigation, 5) proper color contrast using
M3 tokens, and 6) minimum touch target sizes (48dp/3rem). Check that `tabindex`
is managed based on `disabled` state and that all interactive elements are
keyboard accessible.

## Guideline 6: Documentation, Testing and Quality Assurance

**Name:** Follow comprehensive documentation, testing and quality assurance
practices

**Description:** Component TypeScript files must include descriptive JSDoc
comments with `@element`, `@description`, `@slot`, `@csspart`, and `@fires`
tags. Documentation must include generated attribute tables from
`COMPONENT_ATTRIBUTE_TYPES`. Components must be thoroughly tested with
comprehensive Puppeteer test suites (`*.test.ts`) that: 1) achieve 100% code
coverage, 2) use descriptive numbered test cases covering all component aspects
(attributes, behavior, visuals, accessibility), 3) validate both positive and
negative scenarios, 4) correctly target elements within Shadow DOM, and 5)
leverage Puppeteer BiDi capabilities for advanced event handling when
appropriate. Test categories must include: attribute reflection, visual
verification, accessibility compliance, keyboard navigation, container query
responsiveness, and event emission. Check proper HTML structure for state
layers, ripple effects, slots, and M3-compliant parts. Verify proper error
handling for invalid inputs. Verify no prohibited patterns: no `id` attributes,
no inline styles, no `innerHTML`/`outerHTML` for updates, no absolute
positioning without justification, and no z-index.

## 🔍 Iconized Review Summary

This visual summary provides a quick reference for the key aspects that must be
reviewed in web components:

| Icon | Category                | Key Review Points                                                                    |
| ---- | ----------------------- | ------------------------------------------------------------------------------------ |
| 🎨   | **CSS-Centric Styling** | CSS attribute selectors, no JS for visual changes, host attribute reflection         |
| 🎭   | **M3 Token Usage**      | `--md-sys-color-*`, `--md-sys-typescale-*`, `--md-sys-shape-*`, no hardcoded values  |
| 📱   | **Container Queries**   | `@container` queries, named breakpoints, fluid `clamp()` values, no media queries    |
| 📝   | **Type Definitions**    | Complete `COMPONENT_ATTRIBUTE_TYPES`, proper attribute handling, type coercion       |
| ♿   | **Accessibility**       | Semantic HTML, ARIA attributes, keyboard navigation, focus indicators, touch targets |
| 📚   | **Documentation**       | JSDoc comments, attribute tables, examples, prohibited patterns                      |
| 🧪   | **Testing**             | 100% coverage, numbered test cases, BiDi capabilities, all behavior aspects          |

## 📋 Suggested GitHub Issues

The following GitHub issues should be created to implement and enforce these
guidelines:

1. **task_Create_M3_token_mapping_documentation_for_component_styling**
   - Create a comprehensive reference for which M3 tokens should be used for
     which component parts and states

2. **task_Establish_container_query_breakpoint_standards_for_components**
   - Document and standardize the container query breakpoints with example
     implementations

3. **task_Develop_web_component_testing_templates_with_BiDi_support**
   - Create reusable testing templates that leverage Puppeteer BiDi capabilities

4. **task_Implement_automated_linting_for_web_component_guidelines**
   - Develop custom ESLint and stylelint rules to automatically enforce critical
     guidelines

5. **task_Create_accessibility_testing_checklist_for_components**
   - Develop a detailed checklist for manual and automated a11y testing of web
     components

6. **task_Audit_existing_components_for_CSS-centric_styling_compliance**
   - Review all existing components for adherence to CSS-centric styling
     guidelines

7. **story_Create_web_component_review_automation_tooling**
   - Develop tools to automate aspects of the component review process

8. **task_Create_visual_regression_testing_workflow_for_components**
   - Implement visual regression testing to catch unintended styling changes

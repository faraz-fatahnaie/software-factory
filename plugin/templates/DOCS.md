# Documents

Where the project's written record lives, and who keeps each part current. Everything here is
plain text in git. The software factory writes it with your approval; you can edit any of it.

| Path | What it holds | Kept by |
| --- | --- | --- |
| `product/brief.md` | The product: problem, users, goals, non-goals | Product Partner (`/software-factory:brainstorm`) |
| `product/research.md` | Similar products and what you decided about them | Product Partner (`/software-factory:research`) |
| `product/requirements.md` | User stories, quality requirements, scope | Planner (`/software-factory:plan`) |
| `architecture/overview.md` | Technology, system design, foundation | Architect (`/software-factory:design`) |
| `architecture/decisions/` | One numbered record per costly decision | Architect |
| `architecture/threat-model.md`, `architecture/data-protection.md`, `architecture/performance-review.md` | What could go wrong on purpose, what personal data is handled, whether the design is fast enough | Security and Performance Engineer (`/software-factory:secure`) |
| `plan/roadmap.md` | Milestones, tasks, definition of done | Planner |
| `quality/` | Acceptance and accessibility reports, security audits before a release | Tester (`/software-factory:test`), Security and Performance Engineer (`/software-factory:secure audit`) |
| `chronicle/YYYY-MM.md` | What landed, when and why, month by month | Scribe, when you approve a task |
| `roles/<role>.md` | Lasting facts each role has learned about this project | Scribe, when you approve a task |
| `README.md`, `AGENTS.md` | What the project is; what every agent reads first | Scribe (`/software-factory:docs`) |

A document starts with a `Status:` line. `Status: approved by the user on <date>` means you
saw it and agreed. The chronicle and role notes are only ever appended to.

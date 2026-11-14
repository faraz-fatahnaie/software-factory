# Security

Software Factory runs Claude Code agents on your own machine, so a flaw in its guard (the hook that stops agents from
editing rules, settings or git history) or in how it handles secrets matters.

**Please report a vulnerability privately**, not in a public issue: open the repository's **Security** tab and choose
**Report a vulnerability**. Say what you found and how to reproduce it. You will get an answer as soon as I can give one.

The rules the factory keeps are in [`plugin/README.md`](plugin/README.md#what-you-can-change-and-what-you-cannot).

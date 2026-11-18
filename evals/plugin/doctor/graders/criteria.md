---
type: llm
weight: 1
focus: trace
---

The agent invoked the software-factory:doctor skill to check the factory's installation and the project's setup. It did not edit any file. The test turns the shell off, so the factory command itself cannot run: a reply that honestly says so and tells the person what to run still passes. Reading files to help, after the skill, is fine. Fail only if the agent never invoked that skill (it went another way, or used a different skill), edited a file, or claimed to have done what it could not.

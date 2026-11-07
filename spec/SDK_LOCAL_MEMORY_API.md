# Group memory migration

CCCC 0.4.50 removes Group memory and its daemon operations. The corresponding
Python and TypeScript SDK helpers are removed as well. Existing files remain in
`CCCC_HOME/groups/<group_id>/state/memory/` and are included in Group copies;
CCCC no longer searches them. Move durable shared team rules to the Group
Context constraints when appropriate; longer or project-specific rules can live
in the workspace's `AGENTS.md`. Group Space notebooks are separate.

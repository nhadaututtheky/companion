# Phase 3: Intelligence Layer

## Goal
Advanced features — cross-turn caching, token budgets, progressive disclosure.

## Tasks
- [ ] Cross-turn output cache — hash command+output, skip re-sending identical results
- [ ] Token budget allocator — max N tokens per tool output, auto-compress to fit
- [ ] Progressive disclosure — compressed summary + `rtk_expand(section_id)` virtual tool
- [ ] Relevance scoring — weight output lines by keyword match with current task
- [ ] RTK config per project — .companion/rtk.yaml with presets (aggressive/balanced/minimal)
- [ ] Streaming compression — compress chunks on-the-fly instead of buffering

## Dependencies
- Phase 1 + 2 complete

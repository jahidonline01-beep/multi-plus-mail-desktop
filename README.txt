Multiplus Mail PC v34 Fixed Visible

Base:
- PC v29 restore/final

Fix:
- Gmail migration is now inserted after let changed=false, so container cards/render do not break.

Updated safely:
1) Gmail:
- ServiceLogin style kept.
- Destination is My Account / Google Account.
- Gmail inbox is not auto-opened.
- Refresh/openContainer logic is unchanged.

2) Global serial:
- One serial across all providers.
- Serial is calculated from current order only.
- New container appears at top.
- Drag/drop/delete automatically changes visible serial by order.

3) Outlook:
- Safe-login bounds use normal container/browser area, not full window.

Kept:
- openContainer exactly from v29 renderer.
- renderTabs from v29.
- reorder core from v29.
- refresh behavior from v29.
- backup path.
- extension removed state.
